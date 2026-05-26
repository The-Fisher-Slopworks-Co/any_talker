// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "../../storage/memory";
import { TokenBucketLimiter } from "../../ratelimit/token-bucket";
import type { AIClient, AskResult } from "../../ai/types";
import { askHandler, type AskInput, type AskOutcome } from "./ask";
import { DEFAULT_SETTINGS } from "../../shared/types";

class FakeAI implements AIClient {
  constructor(public reply: AskResult = { text: "mock reply", totalTokens: 100 }) {}
  calls: unknown[] = [];
  async ask(opts: Parameters<AIClient["ask"]>[0]): Promise<AskResult> {
    this.calls.push(opts);
    return this.reply;
  }
}

const baseInput = (overrides: Partial<AskInput> = {}): AskInput => ({
  storage: new MemoryStorage(),
  rateLimiter: new TokenBucketLimiter(new MemoryStorage()),
  ai: new FakeAI(),
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
});

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
        mediaType: "audio/ogg",
      },
    ]);
  });

  test("rate-limit hit returns rateLimited", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const rlStorage = new MemoryStorage();
    await rlStorage.saveBucket("c1", "42", { tokens: 0, lastRefillTs: 1000 });
    const rl = new TokenBucketLimiter(rlStorage);
    const out = await askHandler(baseInput({ storage, rateLimiter: rl }));
    expect(out.kind).toBe("rateLimited");
    if (out.kind === "rateLimited") expect(out.minutesUntilNextRefill).toBeGreaterThan(0);
  });

  test("owner with ownerExempt skips rate limit", async () => {
    const storage = new MemoryStorage();
    await storage.saveSettings({
      ...DEFAULT_SETTINGS,
      rateLimit: { ...DEFAULT_SETTINGS.rateLimit, ownerExempt: true },
    });
    const rlStorage = new MemoryStorage();
    await rlStorage.saveBucket("c1", "1", { tokens: 0, lastRefillTs: 1000 });
    const rl = new TokenBucketLimiter(rlStorage);
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
    await rlStorage.saveBucket("c1", "1", { tokens: 0, lastRefillTs: 1000 });
    const rl = new TokenBucketLimiter(rlStorage);
    const out = await askHandler(baseInput({ storage, userId: "1", rateLimiter: rl }));
    expect(out.kind).toBe("rateLimited");
  });

  test("user with BYOK key skips rate limit and passes key to AI", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    await storage.setUserOpenrouterKey("42", "sk-or-byok");
    const rlStorage = new MemoryStorage();
    await rlStorage.saveBucket("c1", "42", { tokens: 0, lastRefillTs: 1000 });
    const rl = new TokenBucketLimiter(rlStorage);
    const ai = new FakeAI({ text: "ok", totalTokens: 500 });
    const out = await askHandler(
      baseInput({ storage, ai, rateLimiter: rl }),
    );
    expect(out.kind).toBe("answered");
    expect(ai.calls.length).toBe(1);
    const call = ai.calls[0] as { apiKey?: string | null };
    expect(call.apiKey).toBe("sk-or-byok");
    const bucketAfter = await rlStorage.getBucket("c1", "42");
    expect(bucketAfter?.tokens).toBe(0);
  });

  test("user with BYOK key bypasses the whitelist", async () => {
    const storage = new MemoryStorage();
    await storage.setUserOpenrouterKey("42", "sk-or-byok");
    const out = await askHandler(baseInput({ storage }));
    expect(out.kind).toBe("answered");
  });

  test("user without BYOK key and not whitelisted is denied", async () => {
    const storage = new MemoryStorage();
    const out = await askHandler(baseInput({ storage }));
    expect(out.kind).toBe("denied");
  });

  test("user without BYOK key passes null apiKey to AI", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const ai = new FakeAI();
    const rl = new TokenBucketLimiter(new MemoryStorage());
    await askHandler(baseInput({ storage, ai, rateLimiter: rl }));
    const call = ai.calls[0] as { apiKey?: string | null };
    expect(call.apiKey).toBeNull();
  });

  test("user with BYOK key + custom models passes the custom models", async () => {
    const storage = new MemoryStorage();
    await storage.setUserOpenrouterKey("42", "sk-or-byok");
    await storage.setUserOpenrouterModels("42", ["openai/gpt-4o-mini"]);
    const ai = new FakeAI();
    const rl = new TokenBucketLimiter(new MemoryStorage());
    await askHandler(baseInput({ storage, ai, rateLimiter: rl }));
    const call = ai.calls[0] as { models: string[] };
    expect(call.models).toEqual(["openai/gpt-4o-mini"]);
  });

  test("custom models without a BYOK key fall back to the bot's models", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    await storage.setUserOpenrouterModels("42", ["openai/gpt-4o-mini"]);
    const ai = new FakeAI();
    const rl = new TokenBucketLimiter(new MemoryStorage());
    await askHandler(baseInput({ storage, ai, rateLimiter: rl }));
    const call = ai.calls[0] as { models: string[] };
    expect(call.models).toEqual(DEFAULT_SETTINGS.models);
  });

  test("answered: returns text and persistConversation callback to apply after sending", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const ai = new FakeAI({ text: "hi back", totalTokens: 250 });
    const rl = new TokenBucketLimiter(new MemoryStorage());
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
    await rlStorage.saveBucket("c1", "42", { tokens: 0, lastRefillTs: 1000 });
    const rl = new TokenBucketLimiter(rlStorage);
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

  test("provider sort: forwards global setting to the AI client", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    await storage.saveSettings({
      ...DEFAULT_SETTINGS,
      providerSort: "throughput",
    });
    const ai = new FakeAI();
    await askHandler(baseInput({ storage, ai }));
    expect((ai.calls[0] as { providerSort: unknown }).providerSort).toBe(
      "throughput",
    );
  });

  test("provider sort: chat override beats global", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    await storage.saveSettings({
      ...DEFAULT_SETTINGS,
      providerSort: "throughput",
    });
    await storage.saveChatSettings("c1", { providerSort: "price" });
    const ai = new FakeAI();
    await askHandler(baseInput({ storage, ai }));
    expect((ai.calls[0] as { providerSort: unknown }).providerSort).toBe("price");
  });

  test("provider sort: chat null override turns off global sort", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    await storage.saveSettings({
      ...DEFAULT_SETTINGS,
      providerSort: "latency",
    });
    await storage.saveChatSettings("c1", { providerSort: null });
    const ai = new FakeAI();
    await askHandler(baseInput({ storage, ai }));
    expect((ai.calls[0] as { providerSort: unknown }).providerSort).toBeNull();
  });

  test("service tier: forwards global setting to the AI client", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    await storage.saveSettings({
      ...DEFAULT_SETTINGS,
      serviceTier: "flex",
    });
    const ai = new FakeAI();
    await askHandler(baseInput({ storage, ai }));
    expect((ai.calls[0] as { serviceTier: unknown }).serviceTier).toBe("flex");
  });

  test("service tier: chat override beats global", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    await storage.saveSettings({
      ...DEFAULT_SETTINGS,
      serviceTier: "flex",
    });
    await storage.saveChatSettings("c1", { serviceTier: "priority" });
    const ai = new FakeAI();
    await askHandler(baseInput({ storage, ai }));
    expect((ai.calls[0] as { serviceTier: unknown }).serviceTier).toBe(
      "priority",
    );
  });

  test("answered: deducts tokens from bucket", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const rlStorage = new MemoryStorage();
    const rl = new TokenBucketLimiter(rlStorage);
    const ai = new FakeAI({ text: "ok", totalTokens: 1234 });
    const out = await askHandler(baseInput({ storage, rateLimiter: rl, ai }));
    expect(out.kind).toBe("answered");
    expect((await rlStorage.getBucket("c1", "42"))?.tokens).toBe(
      DEFAULT_SETTINGS.rateLimit.capacity - 1234,
    );
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
    const rl = new TokenBucketLimiter(rlStorage);
    const ai = new FakeAI({ text: "ok", totalTokens: 1000 });
    await askHandler(
      baseInput({ storage, rateLimiter: rl, ai, detailLevel: "wise" }),
    );
    expect((await rlStorage.getBucket("c1", "42"))?.tokens).toBe(
      DEFAULT_SETTINGS.rateLimit.capacity - 1800,
    );
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
    const rl = new TokenBucketLimiter(rlStorage);
    const ai = new FakeAI({ text: "ok", totalTokens: 1000 });
    await askHandler(
      baseInput({ storage, rateLimiter: rl, ai, detailLevel: "short" }),
    );
    expect((await rlStorage.getBucket("c1", "42"))?.tokens).toBe(
      DEFAULT_SETTINGS.rateLimit.capacity - 1000,
    );
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
