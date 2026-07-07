// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "../../storage/memory";
import { DualWindowLimiter } from "../../ratelimit/dual-window";
import { currentWindowStarts } from "../../ratelimit/window";
import type { AIClient, AskResult } from "../../ai/types";
import { askHandler, type AskInput, type AskOutcome } from "./ask";
import { createMainPersonaResolver } from "../../managed-bots/persona";
import { DEFAULT_SETTINGS } from "../../shared/types";

// Exhausts a user's 5-hour budget at `now` (fills both windows to the default
// 5-hour limit) so the next `check` denies. Mirrors how an over-spent user
// looks in the new per-user dual-window model.
async function exhaustUsage(
  storage: MemoryStorage,
  userId: string,
  now: number,
): Promise<void> {
  const starts = currentWindowStarts(userId, now);
  await storage.addUserUsage(
    userId,
    DEFAULT_SETTINGS.rateLimit.fiveHourTokens,
    starts.fiveHour,
    starts.weekly,
  );
}

class FakeAI implements AIClient {
  constructor(public reply: AskResult = { text: "mock reply", totalTokens: 100 }) {}
  calls: unknown[] = [];
  async ask(opts: Parameters<AIClient["ask"]>[0]): Promise<AskResult> {
    this.calls.push(opts);
    return this.reply;
  }
}

const baseInput = (overrides: Partial<AskInput> = {}): AskInput => {
  const storage = overrides.storage ?? new MemoryStorage();
  return {
    storage,
    rateLimiter: new DualWindowLimiter(new MemoryStorage()),
    ai: new FakeAI(),
    resolver: createMainPersonaResolver(storage),
    ownerId: "1",
    now: 1_000,
    chatId: "c1",
    userId: "42",
    askMessageId: 1,
    sender: { firstName: "John", lastName: "Doe", nameOverride: null, gender: null },
    userText: "hello",
    quote: null,
    images: [],
    imageFileIds: [],
    replyImageFileIds: [],
    replyTarget: null,
    lang: "en",
    detailLevel: "short",
    ...overrides,
  };
};

describe("askHandler", () => {
  test("denied when not whitelisted and not owner", async () => {
    const out: AskOutcome = await askHandler(baseInput());
    expect(out.kind).toBe("denied");
  });

  test("usage hint when text is empty and no reply", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const out = await askHandler(baseInput({ storage, userText: "" }));
    expect(out.kind).toBe("usage");
  });

  test("voice-only request (empty text, audio attached) is not a usage hint", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const ai = new FakeAI();
    const out = await askHandler(
      baseInput({
        storage,
        ai,
        userText: "",
        audios: [new Uint8Array([0x4f, 0x67, 0x67, 0x53])],
      }),
    );
    expect(out.kind).toBe("answered");
    const sent = (ai.calls[0] as { messages: { content: unknown }[] }).messages;
    expect(sent[0]!.content).toEqual([
      { type: "text", text: JSON.stringify({ author: "John Doe", text: "" }) },
      {
        type: "audio",
        audio: new Uint8Array([0x4f, 0x67, 0x67, 0x53]),
        mediaType: "audio/mp3",
      },
    ]);
  });

  test("rate-limit hit returns rateLimited", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const rlStorage = new MemoryStorage();
    await exhaustUsage(rlStorage, "42", 1000);
    const rl = new DualWindowLimiter(rlStorage);
    const out = await askHandler(baseInput({ storage, rateLimiter: rl }));
    expect(out.kind).toBe("rateLimited");
    if (out.kind === "rateLimited") expect(out.msUntilReset).toBeGreaterThan(0);
  });

  test("owner with ownerExempt skips rate limit", async () => {
    const storage = new MemoryStorage();
    await storage.saveSettings({
      ...DEFAULT_SETTINGS,
      rateLimit: { ...DEFAULT_SETTINGS.rateLimit, ownerExempt: true },
    });
    const rlStorage = new MemoryStorage();
    await exhaustUsage(rlStorage, "1", 1000);
    const rl = new DualWindowLimiter(rlStorage);
    const out = await askHandler(baseInput({ storage, userId: "1", rateLimiter: rl }));
    expect(out.kind).toBe("answered");
  });

  test("owner without ownerExempt is rate limited", async () => {
    const storage = new MemoryStorage();
    await storage.saveSettings({
      ...DEFAULT_SETTINGS,
      rateLimit: { ...DEFAULT_SETTINGS.rateLimit, ownerExempt: false },
    });
    const rlStorage = new MemoryStorage();
    await exhaustUsage(rlStorage, "1", 1000);
    const rl = new DualWindowLimiter(rlStorage);
    const out = await askHandler(baseInput({ storage, userId: "1", rateLimiter: rl }));
    expect(out.kind).toBe("rateLimited");
  });

  test("passes the configured models to the AI", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const ai = new FakeAI();
    const rl = new DualWindowLimiter(new MemoryStorage());
    await askHandler(baseInput({ storage, ai, rateLimiter: rl }));
    const call = ai.calls[0] as { models: string[] };
    expect(call.models).toEqual(DEFAULT_SETTINGS.models);
  });

  test("answered: returns text and persistConversation callback to apply after sending", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const ai = new FakeAI({ text: "hi back", totalTokens: 250 });
    const rl = new DualWindowLimiter(new MemoryStorage());
    const out = await askHandler(baseInput({ storage, ai, rateLimiter: rl }));
    expect(out.kind).toBe("answered");
    if (out.kind === "answered") {
      expect(out.text).toBe("hi back");
      expect(out.botName).toBe(null);
      // After bot sends message id 999 in the chat, caller invokes:
      await out.persistConversation(999);
      const node = await storage.getConversation("c1", 999);
      expect(node).toEqual({
        userQuestion: JSON.stringify({ author: "John Doe", text: "hello" }),
        botAnswer: "hi back",
        parentBotMsgId: null,
        ts: 1000,
      });
      // The turn is also keyed by the user's ask message id, so replying to
      // one's own question resolves the chain too.
      expect(await storage.getConversation("c1", 1)).toEqual(node!);
    }
  });

  test("answered: persistConversation links parent when reply was to existing bot msg", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    await storage.saveConversation("c1", 100, {
      userQuestion: "Q1",
      botAnswer: "A1",
      parentBotMsgId: null,
      ts: 1,
    });
    const out = await askHandler(
      baseInput({
        storage,
        replyTarget: { messageId: 100, text: "A1", authorFirstName: "Bot", images: [] },
      }),
    );
    if (out.kind === "answered") {
      await out.persistConversation(200);
      expect(await storage.getConversation("c1", 200)).toMatchObject({
        parentBotMsgId: 100,
      });
    } else {
      throw new Error("expected answered");
    }
  });

  test("rateLimited: persistConversation saves the turn under the notice and ask message ids", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    await storage.saveConversation("c1", 2, {
      userQuestion: "Q1",
      botAnswer: "A1",
      parentBotMsgId: null,
      ts: 1,
    });
    const rlStorage = new MemoryStorage();
    await exhaustUsage(rlStorage, "42", 1000);
    const out = await askHandler(
      baseInput({
        storage,
        rateLimiter: new DualWindowLimiter(rlStorage),
        askMessageId: 3,
        userText: "How was your day?",
        replyTarget: { messageId: 2, text: "A1", authorFirstName: "Bot", images: [] },
      }),
    );
    if (out.kind !== "rateLimited") throw new Error("expected rateLimited");
    await out.persistConversation(4, "You are rate-limited");
    const expected = {
      userQuestion: JSON.stringify({ author: "John Doe", text: "How was your day?" }),
      botAnswer: "You are rate-limited",
      parentBotMsgId: 2,
      ts: 1000,
    };
    expect(await storage.getConversation("c1", 4)).toEqual(expected);
    expect(await storage.getConversation("c1", 3)).toEqual(expected);
  });

  test("error: persistConversation saves the turn so the chain survives provider failures", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    class ThrowingAI implements AIClient {
      async ask(): Promise<AskResult> {
        throw new Error("provider down");
      }
    }
    const out = await askHandler(
      baseInput({ storage, ai: new ThrowingAI(), askMessageId: 3 }),
    );
    if (out.kind !== "error") throw new Error("expected error");
    await out.persistConversation(4, "AI error");
    const expected = {
      userQuestion: JSON.stringify({ author: "John Doe", text: "hello" }),
      botAnswer: "AI error",
      parentBotMsgId: null,
      ts: 1000,
    };
    expect(await storage.getConversation("c1", 4)).toEqual(expected);
    expect(await storage.getConversation("c1", 3)).toEqual(expected);
  });

  test("an empty AI answer is an error turn, not an answered one (Telegram rejects empty messages)", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const out = await askHandler(
      baseInput({ storage, ai: new FakeAI({ text: "  \n", totalTokens: 50 }) }),
    );
    expect(out.kind).toBe("error");
  });

  test("a rate-limited turn does not sever the chain: reply to own ask message carries full history", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });

    // Turn 1: "/ask hello" (msg 1) → answered "Hi!" (msg 2).
    const first = await askHandler(
      baseInput({
        storage,
        askMessageId: 1,
        userText: "hello",
        ai: new FakeAI({ text: "Hi!", totalTokens: 1 }),
      }),
    );
    if (first.kind !== "answered") throw new Error("expected answered");
    await first.persistConversation(2);

    // Turn 2: reply to msg 2 (msg 3) → rate-limit notice (msg 4).
    const rlStorage = new MemoryStorage();
    await exhaustUsage(rlStorage, "42", 1000);
    const second = await askHandler(
      baseInput({
        storage,
        rateLimiter: new DualWindowLimiter(rlStorage),
        askMessageId: 3,
        userText: "How was your day?",
        replyTarget: { messageId: 2, text: "Hi!", authorFirstName: "Bot", images: [] },
      }),
    );
    if (second.kind !== "rateLimited") throw new Error("expected rateLimited");
    await second.persistConversation(4, "You are rate-limited");

    // Turn 3: reply to the user's OWN msg 3 — the AI must see the whole chain
    // 3 → 2, i.e. turns 1 and 2 including the rate-limit notice.
    const ai = new FakeAI();
    const third = await askHandler(
      baseInput({
        storage,
        ai,
        askMessageId: 50,
        userText: "What is my first ever message?",
        replyTarget: {
          messageId: 3,
          text: "/ask How was your day?",
          authorFirstName: "John",
          images: [],
        },
      }),
    );
    expect(third.kind).toBe("answered");
    const sent = (ai.calls[0] as { messages: { content: unknown }[] }).messages;
    expect(sent.map((m) => m.content)).toEqual([
      JSON.stringify({ author: "John Doe", text: "hello" }),
      "Hi!",
      JSON.stringify({ author: "John Doe", text: "How was your day?" }),
      "You are rate-limited",
      JSON.stringify({ author: "John Doe", text: "What is my first ever message?" }),
    ]);
  });

  test("onAIStart fires immediately before the AI call", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const events: string[] = [];

    class WatchAI implements AIClient {
      async ask(): Promise<AskResult> {
        events.push("ai");
        return { text: "ok", totalTokens: 1 };
      }
    }
    const out = await askHandler(
      baseInput({
        storage,
        ai: new WatchAI(),
        onAIStart: () => events.push("typing"),
      }),
    );
    expect(out.kind).toBe("answered");
    expect(events).toEqual(["typing", "ai"]);
  });

  test("onAIStart is NOT called when request is denied", async () => {
    let called = false;
    const out = await askHandler(
      baseInput({ onAIStart: () => (called = true) }),
    );
    expect(out.kind).toBe("denied");
    expect(called).toBe(false);
  });

  test("onAIStart is NOT called when rate-limited", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const rlStorage = new MemoryStorage();
    await exhaustUsage(rlStorage, "42", 1000);
    const rl = new DualWindowLimiter(rlStorage);
    let called = false;
    const out = await askHandler(
      baseInput({ storage, rateLimiter: rl, onAIStart: () => (called = true) }),
    );
    expect(out.kind).toBe("rateLimited");
    expect(called).toBe(false);
  });

  test("answered: passes composed system instruction to AI", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    await storage.saveSettings({
      ...DEFAULT_SETTINGS,
      systemPrompt: "Grumpy pirate.",
    });
    const ai = new FakeAI();
    const out = await askHandler(baseInput({ storage, ai }));
    expect(out.kind).toBe("answered");
    const sys = (ai.calls[0] as { system: string }).system;
    expect(sys).toContain("# Формат сообщений");
    expect(sys).toContain("# Формат ответа");
    expect(sys).toContain("Grumpy pirate.");
  });

  test("detail level short: brief answer + low reasoning effort", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const ai = new FakeAI();
    await askHandler(baseInput({ storage, ai, detailLevel: "short" }));
    const call = ai.calls[0] as { system: string; reasoningEffort: unknown };
    expect(call.system).toContain("# Уровень подробности");
    expect(call.system).toContain("3 предложения");
    expect(call.reasoningEffort).toBe("low");
  });

  test("detail level wise: detailed answer + high reasoning effort", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const ai = new FakeAI();
    await askHandler(baseInput({ storage, ai, detailLevel: "wise" }));
    const call = ai.calls[0] as { system: string; reasoningEffort: unknown };
    expect(call.system).toContain("# Уровень подробности");
    expect(call.system).toContain("Отвечай подробно");
    expect(call.reasoningEffort).toBe("high");
  });

  test("timezone resolution: user > chat > global", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    await storage.saveSettings({
      ...DEFAULT_SETTINGS,
      timezone: "Europe/London",
    });
    await storage.saveChatSettings("c1", { timezone: "Asia/Tokyo" });
    await storage.setUserTimezone("42", "Asia/Yekaterinburg");

    const ai = new FakeAI();
    await askHandler(baseInput({ storage, ai }));
    const sys = (ai.calls[0] as { system: string }).system;
    expect(sys).toContain("Таймзона пользователя: Asia/Yekaterinburg.");
  });

  test("timezone resolution falls back to chat when user has no override", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    await storage.saveSettings({
      ...DEFAULT_SETTINGS,
      timezone: "Europe/London",
    });
    await storage.saveChatSettings("c1", { timezone: "Asia/Tokyo" });

    const ai = new FakeAI();
    await askHandler(baseInput({ storage, ai }));
    const sys = (ai.calls[0] as { system: string }).system;
    expect(sys).toContain("Таймзона пользователя: Asia/Tokyo.");
  });

  test("timezone resolution falls back to global when nothing else set", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    await storage.saveSettings({
      ...DEFAULT_SETTINGS,
      timezone: "Europe/London",
    });

    const ai = new FakeAI();
    await askHandler(baseInput({ storage, ai }));
    const sys = (ai.calls[0] as { system: string }).system;
    expect(sys).toContain("Таймзона пользователя: Europe/London.");
  });

  test("answered: returns botName from chat settings when set", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    await storage.saveChatSettings("c1", { botName: "  Helper  " });
    const out = await askHandler(baseInput({ storage }));
    if (out.kind !== "answered") throw new Error("expected answered");
    expect(out.botName).toBe("Helper");
  });

  test("answered: returns null botName when chat settings has empty botName", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    await storage.saveChatSettings("c1", { systemPrompt: "p" });
    const out = await askHandler(baseInput({ storage }));
    if (out.kind !== "answered") throw new Error("expected answered");
    expect(out.botName).toBe(null);
  });

  test("answered: deducts tokens from bucket", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const rlStorage = new MemoryStorage();
    const rl = new DualWindowLimiter(rlStorage);
    const ai = new FakeAI({ text: "ok", totalTokens: 1234 });
    const out = await askHandler(baseInput({ storage, rateLimiter: rl, ai }));
    expect(out.kind).toBe("answered");
    expect((await rlStorage.getUserUsage("42"))?.fiveHour.used).toBe(1234);
  });

  test("wise level multiplies deduction by wiseMultiplier", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    await storage.saveSettings({
      ...DEFAULT_SETTINGS,
      rateLimit: {
        ...DEFAULT_SETTINGS.rateLimit,
        wiseMultiplier: 1.8,
      },
    });
    const rlStorage = new MemoryStorage();
    const rl = new DualWindowLimiter(rlStorage);
    const ai = new FakeAI({ text: "ok", totalTokens: 1000 });
    await askHandler(
      baseInput({ storage, rateLimiter: rl, ai, detailLevel: "wise" }),
    );
    expect((await rlStorage.getUserUsage("42"))?.fiveHour.used).toBe(1800);
  });

  test("short level deducts raw tokens (multiplier = 1)", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    await storage.saveSettings({
      ...DEFAULT_SETTINGS,
      rateLimit: {
        ...DEFAULT_SETTINGS.rateLimit,
        wiseMultiplier: 10,
      },
    });
    const rlStorage = new MemoryStorage();
    const rl = new DualWindowLimiter(rlStorage);
    const ai = new FakeAI({ text: "ok", totalTokens: 1000 });
    await askHandler(
      baseInput({ storage, rateLimiter: rl, ai, detailLevel: "short" }),
    );
    expect((await rlStorage.getUserUsage("42"))?.fiveHour.used).toBe(1000);
  });

  test("answered: records reported costUsd to the user's spend", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const ai = new FakeAI({ text: "ok", totalTokens: 100, costUsd: 0.0123 });
    const out = await askHandler(baseInput({ storage, ai }));
    expect(out.kind).toBe("answered");
    const spend = await storage.getUserSpend("42", 1000);
    expect(spend.day).toBeCloseTo(0.0123, 6);
    expect(spend.month).toBeCloseTo(0.0123, 6);
  });

  test("answered: records spend even when rate-limit exempt (owner)", async () => {
    const storage = new MemoryStorage();
    await storage.saveSettings({
      ...DEFAULT_SETTINGS,
      rateLimit: { ...DEFAULT_SETTINGS.rateLimit, ownerExempt: true },
    });
    const ai = new FakeAI({ text: "ok", totalTokens: 10, costUsd: 0.5 });
    const out = await askHandler(baseInput({ storage, ai, userId: "1" }));
    expect(out.kind).toBe("answered");
    expect((await storage.getUserSpend("1", 1000)).day).toBeCloseTo(0.5, 6);
  });

  test("answered: records no spend when costUsd is absent or zero", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const ai = new FakeAI({ text: "ok", totalTokens: 100 });
    await askHandler(baseInput({ storage, ai }));
    expect((await storage.getUserSpend("42", 1000)).month).toBe(0);
  });

  test("answered: propagates tool effects recorded into ctx.effects", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });

    class EffectfulAI implements AIClient {
      async ask(opts: Parameters<AIClient["ask"]>[0]): Promise<AskResult> {
        opts.toolCallContext.effects?.push({
          type: "reminder_scheduled",
          fireAtMs: 123_456_789,
          timezone: "Europe/Moscow",
        });
        return { text: "done", totalTokens: 10 };
      }
    }

    const out = await askHandler(baseInput({ storage, ai: new EffectfulAI() }));
    if (out.kind !== "answered") throw new Error("expected answered");
    expect(out.effects).toEqual([
      { type: "reminder_scheduled", fireAtMs: 123_456_789, timezone: "Europe/Moscow" },
    ]);
  });

  test("answered: effects defaults to an empty array when no tools fire", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const out = await askHandler(baseInput({ storage }));
    if (out.kind !== "answered") throw new Error("expected answered");
    expect(out.effects).toEqual([]);
  });

  test("answered: persists userImageFileIds when images were attached", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const bytes = new Uint8Array([0xff, 0xd8]);
    const out = await askHandler(
      baseInput({
        storage,
        images: [bytes],
        imageFileIds: ["telegram_file_xyz"],
      }),
    );
    if (out.kind !== "answered") throw new Error("expected answered");
    await out.persistConversation(555);
    const node = await storage.getConversation("c1", 555);
    expect(node?.userImageFileIds).toEqual(["telegram_file_xyz"]);
  });

  test("answered: persists replyImageFileIds when images came from a reply target", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const out = await askHandler(
      baseInput({
        storage,
        replyTarget: {
          messageId: 0,
          text: null,
          authorFirstName: "Someone",
          images: [new Uint8Array([1])],
        },
        replyImageFileIds: ["album_file_1", "album_file_2"],
      }),
    );
    if (out.kind !== "answered") throw new Error("expected answered");
    await out.persistConversation(556);
    const node = await storage.getConversation("c1", 556);
    expect(node?.userImageFileIds).toEqual(["album_file_1", "album_file_2"]);
  });

  test("answered: merges direct and reply image file IDs (direct first)", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const out = await askHandler(
      baseInput({
        storage,
        images: [new Uint8Array([9])],
        imageFileIds: ["direct_file"],
        replyTarget: {
          messageId: 0,
          text: null,
          authorFirstName: "Someone",
          images: [new Uint8Array([1])],
        },
        replyImageFileIds: ["album_file_1"],
      }),
    );
    if (out.kind !== "answered") throw new Error("expected answered");
    await out.persistConversation(557);
    const node = await storage.getConversation("c1", 557);
    expect(node?.userImageFileIds).toEqual(["direct_file", "album_file_1"]);
  });

  test("follow-up /ask replaying the chain still surfaces reply-target images", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const replayBytes = new Uint8Array([7, 7, 7]);

    const first = await askHandler(
      baseInput({
        storage,
        userText: "what's on these",
        replyTarget: {
          messageId: 0,
          text: null,
          authorFirstName: "Someone",
          images: [new Uint8Array([1]), new Uint8Array([2])],
        },
        replyImageFileIds: ["album_a", "album_b"],
      }),
    );
    if (first.kind !== "answered") throw new Error("expected answered");
    await first.persistConversation(1000);

    const fetched: string[] = [];
    const ai = new FakeAI();
    const out = await askHandler(
      baseInput({
        storage,
        ai,
        askMessageId: 2,
        userText: "and again?",
        replyTarget: {
          messageId: 1000,
          text: first.text,
          authorFirstName: "Bot",
          images: [],
        },
        fetchPhoto: async (id) => {
          fetched.push(id);
          return replayBytes;
        },
      }),
    );
    if (out.kind !== "answered") throw new Error("expected answered");
    expect(fetched).toEqual(["album_a", "album_b"]);
    const sent = (ai.calls[0] as { messages: { content: unknown }[] }).messages;
    const firstTurnEnvelope = JSON.stringify({
      author: "John Doe",
      text: "what's on these",
    });
    expect(sent[0]!.content).toEqual([
      { type: "text", text: firstTurnEnvelope },
      { type: "image", image: replayBytes, mediaType: "image/jpeg" },
      { type: "image", image: replayBytes, mediaType: "image/jpeg" },
    ]);
  });

  test("answered: omits userImageFileIds when no images were attached", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const out = await askHandler(baseInput({ storage }));
    if (out.kind !== "answered") throw new Error("expected answered");
    await out.persistConversation(555);
    const node = await storage.getConversation("c1", 555);
    expect(node?.userImageFileIds).toBeUndefined();
  });

  test("cross-bot context: a managed bot replays the chain when replying to the main bot's group message", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const groupChat = "-1001"; // negative id => group chat

    // The main bot answered earlier in the group (its message id is 100).
    const mainAi = new FakeAI({ text: "Main answer", totalTokens: 10 });
    const first = await askHandler(
      baseInput({
        storage,
        ai: mainAi,
        chatId: groupChat,
        askMessageId: 1,
        userText: "Q to main",
      }),
    );
    if (first.kind !== "answered") throw new Error("expected answered");
    await first.persistConversation(100);

    // The user replies to the main bot's message (id 100) with /ask@cat-bot.
    const managedAi = new FakeAI({ text: "Managed answer", totalTokens: 10 });
    const out = await askHandler(
      baseInput({
        storage,
        ai: managedAi,
        botId: "cat-bot",
        chatId: groupChat,
        askMessageId: 2,
        userText: "follow-up",
        replyTarget: {
          messageId: 100,
          text: "Main answer",
          authorFirstName: "Bot",
          images: [],
        },
      }),
    );
    if (out.kind !== "answered") throw new Error("expected answered");

    // The managed bot's AI call carries the prior (main-bot) turn as context.
    const sent = (managedAi.calls[0] as { messages: unknown[] }).messages;
    expect(sent[0]).toEqual({
      role: "user",
      content: JSON.stringify({ author: "John Doe", text: "Q to main" }),
    });
    expect(sent[1]).toEqual({ role: "assistant", content: "Main answer" });
    expect(sent[2]).toEqual({
      role: "user",
      content: JSON.stringify({ author: "John Doe", text: "follow-up" }),
    });

    // The managed answer is stored in the shared (group) namespace and links its
    // parent across the bot boundary.
    await out.persistConversation(200);
    expect(await storage.getConversation(groupChat, 200)).toMatchObject({
      parentBotMsgId: 100,
    });
  });

  test("DM conversations stay per-character: cross-bot context does NOT leak in a private chat", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const dm = "42"; // private chat id == user id (positive)

    const mainAi = new FakeAI({ text: "Main DM answer", totalTokens: 10 });
    const first = await askHandler(
      baseInput({
        storage,
        ai: mainAi,
        chatId: dm,
        askMessageId: 1,
        userText: "hi main",
      }),
    );
    if (first.kind !== "answered") throw new Error("expected answered");
    await first.persistConversation(100);

    const managedAi = new FakeAI({ text: "Managed DM answer", totalTokens: 10 });
    const out = await askHandler(
      baseInput({
        storage,
        ai: managedAi,
        botId: "cat-bot",
        chatId: dm,
        askMessageId: 2,
        userText: "follow",
        replyTarget: {
          messageId: 100,
          text: "Main DM answer",
          authorFirstName: "Bot",
          images: [],
        },
      }),
    );
    if (out.kind !== "answered") throw new Error("expected answered");

    // No cross-bot chain replay in a DM: the main bot's turn is not surfaced as a
    // prior assistant message (separate physical chats).
    const sent = (managedAi.calls[0] as { messages: { role: string }[] }).messages;
    expect(sent.some((m) => m.role === "assistant")).toBe(false);

    // The managed answer is scoped to the managed bot, not the shared namespace,
    // and is not linked to the main bot's node.
    await out.persistConversation(200);
    expect(await storage.forBot(null).getConversation(dm, 200)).toBeNull();
    expect(
      await storage.forBot("cat-bot").getConversation(dm, 200),
    ).toMatchObject({ parentBotMsgId: null });
  });

  test("forwards fetchPhoto to buildContext for chain image replay", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const replayBytes = new Uint8Array([1, 2, 3]);
    await storage.saveConversation("c1", 100, {
      userQuestion: "Q-with-photo",
      botAnswer: "A1",
      parentBotMsgId: null,
      ts: 1,
      userImageFileIds: ["file_a"],
    });
    const fetched: string[] = [];
    const fetchPhoto = async (id: string) => {
      fetched.push(id);
      return replayBytes;
    };
    const ai = new FakeAI();
    await askHandler(
      baseInput({
        storage,
        ai,
        fetchPhoto,
        replyTarget: {
          messageId: 100,
          text: "A1",
          authorFirstName: "Bot",
          images: [],
        },
      }),
    );
    expect(fetched).toEqual(["file_a"]);
    const sent = (ai.calls[0] as { messages: { content: unknown }[] }).messages;
    expect(sent[0]!.content).toEqual([
      { type: "text", text: "Q-with-photo" },
      { type: "image", image: replayBytes, mediaType: "image/jpeg" },
    ]);
  });
});
