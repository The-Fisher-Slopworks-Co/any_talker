// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "../../storage/memory";
import { DualWindowLimiter } from "../../ratelimit/dual-window";
import { currentWindowStarts } from "../../ratelimit/window";
import type { AIClient, AskResult } from "../../ai/types";
import { guestAskHandler, type GuestAskInput } from "./guest";
import { createMainPersonaResolver } from "../../managed-bots/persona";
import { DEFAULT_SETTINGS, MAX_REPLY_CHAIN_DEPTH } from "../../shared/types";

// Exhausts a user's 5-hour budget at `now` so the next `check` denies.
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
  constructor(public reply: AskResult = { text: "guest reply", totalTokens: 50 }) {}
  calls: unknown[] = [];
  async ask(opts: Parameters<AIClient["ask"]>[0]): Promise<AskResult> {
    this.calls.push(opts);
    return this.reply;
  }
}

const baseInput = (overrides: Partial<GuestAskInput> = {}): GuestAskInput => {
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
    sender: { firstName: "Jane", lastName: null, nameOverride: null, gender: null },
    userText: "hello",
    quote: null,
    images: [],
    imageFileIds: [],
    replyImageFileIds: [],
    replyTarget: null,
    priorThread: null,
    lang: "en",
    ...overrides,
  };
};

describe("guestAskHandler", () => {
  test("denied when not whitelisted and not owner", async () => {
    const out = await guestAskHandler(baseInput());
    expect(out.kind).toBe("denied");
  });

  test("denied when text empty even if whitelisted", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const out = await guestAskHandler(baseInput({ storage, userText: "  " }));
    expect(out.kind).toBe("denied");
  });

  test("chat whitelist alone does NOT grant access in guest mode", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("chats", { id: "c1" });
    const out = await guestAskHandler(baseInput({ storage }));
    expect(out.kind).toBe("denied");
  });

  test("whitelisted user is answered", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const ai = new FakeAI({ text: "hi", totalTokens: 100 });
    const out = await guestAskHandler(baseInput({ storage, ai }));
    expect(out.kind).toBe("answered");
    if (out.kind === "answered") expect(out.text).toBe("hi");
  });

  test("an empty AI answer is an error turn, not an answered one (Telegram rejects empty messages)", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const ai = new FakeAI({ text: "  \n", totalTokens: 50 });
    const out = await guestAskHandler(baseInput({ storage, ai }));
    expect(out.kind).toBe("error");
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
    const out = await guestAskHandler(
      baseInput({ storage, userId: "1", rateLimiter: rl }),
    );
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
    const out = await guestAskHandler(
      baseInput({ storage, userId: "1", rateLimiter: rl }),
    );
    expect(out.kind).toBe("rateLimited");
  });

  test("rate-limit hit returns rateLimited", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const rlStorage = new MemoryStorage();
    await exhaustUsage(rlStorage, "42", 1000);
    const rl = new DualWindowLimiter(rlStorage);
    const out = await guestAskHandler(
      baseInput({ storage, rateLimiter: rl }),
    );
    expect(out.kind).toBe("rateLimited");
    if (out.kind === "rateLimited")
      expect(out.msUntilReset).toBeGreaterThan(0);
  });

  test("answered: records reported costUsd to the user's spend", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const ai = new FakeAI({ text: "hi", totalTokens: 50, costUsd: 0.02 });
    const out = await guestAskHandler(baseInput({ storage, ai }));
    expect(out.kind).toBe("answered");
    expect((await storage.getUserSpend("42", 1000)).day).toBeCloseTo(0.02, 6);
  });

  test("answered: records no spend when costUsd is absent", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const ai = new FakeAI({ text: "hi", totalTokens: 50 });
    await guestAskHandler(baseInput({ storage, ai }));
    expect((await storage.getUserSpend("42", 1000)).month).toBe(0);
  });

  test("passes the configured models to the AI", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const ai = new FakeAI();
    const out = await guestAskHandler(baseInput({ storage, ai }));
    expect(out.kind).toBe("answered");
    const call = ai.calls[0] as { models: string[] };
    expect(call.models).toEqual(DEFAULT_SETTINGS.models);
  });

  test("answered: persistThread stores a fresh thread keyed by chatId", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const ai = new FakeAI({ text: "the answer", totalTokens: 200 });
    const out = await guestAskHandler(baseInput({ storage, ai }));
    expect(out.kind).toBe("answered");
    if (out.kind !== "answered") return;
    await out.persistThread();
    expect(await storage.getGuestThread("c1")).toEqual({
      chatId: "c1",
      turns: [
        {
          userQuestion: JSON.stringify({ author: "Jane", text: "hello" }),
          botAnswer: "the answer",
        },
      ],
      ts: 1000,
    });
  });

  test("reply to a non-bot message is surfaced as context before the question", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const ai = new FakeAI();
    await guestAskHandler(
      baseInput({
        storage,
        ai,
        replyTarget: {
          messageId: 7,
          text: "how are you?",
          authorFirstName: "Bob",
          images: [],
        },
      }),
    );
    const call = ai.calls[0] as { messages: { role: string; content: unknown }[] };
    expect(call.messages).toEqual([
      { role: "user", content: "Context (replied message from Bob): how are you?" },
      {
        role: "user",
        content: JSON.stringify({ author: "Jane", text: "hello" }),
      },
    ]);
  });

  test("replyTarget falls back to placeholders for missing author/text", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const ai = new FakeAI();
    await guestAskHandler(
      baseInput({
        storage,
        ai,
        replyTarget: { messageId: 7, text: null, authorFirstName: null, images: [] },
      }),
    );
    const call = ai.calls[0] as { messages: { role: string; content: unknown }[] };
    expect(call.messages[0]).toEqual({
      role: "user",
      content: "Context (replied message from unknown): <media>",
    });
  });

  test("stored thread wins over replyTarget (no duplicate context header)", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const ai = new FakeAI();
    const priorThread = {
      chatId: "c1",
      turns: [{ userQuestion: "Q1", botAnswer: "A1" }],
      ts: 500,
    };
    await guestAskHandler(
      baseInput({
        storage,
        ai,
        priorThread,
        replyTarget: { messageId: 7, text: "A1", authorFirstName: "Bot", images: [] },
      }),
    );
    const call = ai.calls[0] as { messages: { role: string; content: unknown }[] };
    expect(call.messages).toEqual([
      { role: "user", content: "Q1" },
      { role: "assistant", content: "A1" },
      {
        role: "user",
        content: JSON.stringify({ author: "Jane", text: "hello" }),
      },
    ]);
  });

  test("empty text with a replyTarget is answered, not denied (bare-mention reply)", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const ai = new FakeAI();
    const out = await guestAskHandler(
      baseInput({
        storage,
        ai,
        userText: "",
        replyTarget: { messageId: 7, text: "hi", authorFirstName: "Bob", images: [] },
      }),
    );
    expect(out.kind).toBe("answered");
  });

  test("empty text with an image attached is answered, not denied", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const out = await guestAskHandler(
      baseInput({
        storage,
        userText: "",
        images: [new Uint8Array([1])],
        imageFileIds: ["f1"],
      }),
    );
    expect(out.kind).toBe("answered");
  });

  test("own images and audio are attached to the envelope as media parts", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const ai = new FakeAI();
    const img = new Uint8Array([1, 2]);
    const voice = new Uint8Array([3, 4]);
    await guestAskHandler(
      baseInput({ storage, ai, images: [img], audios: [voice], imageFileIds: ["f1"] }),
    );
    const call = ai.calls[0] as { messages: { role: string; content: unknown }[] };
    expect(call.messages).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: JSON.stringify({ author: "Jane", text: "hello" }) },
          { type: "image", image: img, mediaType: "image/jpeg" },
          { type: "audio", audio: voice, mediaType: "audio/mp3" },
        ],
      },
    ]);
  });

  test("replied-to images and audio ride along with the context header", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const ai = new FakeAI();
    const img = new Uint8Array([9]);
    const voice = new Uint8Array([8]);
    await guestAskHandler(
      baseInput({
        storage,
        ai,
        replyTarget: {
          messageId: 7,
          text: null,
          authorFirstName: "Bob",
          images: [img],
          audios: [voice],
        },
      }),
    );
    const call = ai.calls[0] as { messages: { role: string; content: unknown }[] };
    expect(call.messages[0]).toEqual({
      role: "user",
      content: [
        { type: "text", text: "Context (replied message from Bob): <media>" },
        { type: "image", image: img, mediaType: "image/jpeg" },
        { type: "audio", audio: voice, mediaType: "audio/mp3" },
      ],
    });
  });

  test("persistThread stores own + reply image file ids on the turn", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const ai = new FakeAI({ text: "seen", totalTokens: 1 });
    const out = await guestAskHandler(
      baseInput({
        storage,
        ai,
        images: [new Uint8Array([1])],
        imageFileIds: ["own1"],
        replyImageFileIds: ["reply1", "reply2"],
      }),
    );
    if (out.kind !== "answered") throw new Error("expected answered");
    await out.persistThread();
    const stored = await storage.getGuestThread("c1");
    expect(stored?.turns[0]?.userImageFileIds).toEqual(["own1", "reply1", "reply2"]);
  });

  test("prior-turn image file ids are re-fetched and attached to the chain", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const ai = new FakeAI();
    const img = new Uint8Array([7, 7]);
    const fetched: string[] = [];
    const priorThread = {
      chatId: "c1",
      turns: [{ userQuestion: "Q1", botAnswer: "A1", userImageFileIds: ["old1"] }],
      ts: 500,
    };
    await guestAskHandler(
      baseInput({
        storage,
        ai,
        priorThread,
        fetchPhoto: async (fileId) => {
          fetched.push(fileId);
          return img;
        },
      }),
    );
    expect(fetched).toEqual(["old1"]);
    const call = ai.calls[0] as { messages: { role: string; content: unknown }[] };
    expect(call.messages[0]).toEqual({
      role: "user",
      content: [
        { type: "text", text: "Q1" },
        { type: "image", image: img, mediaType: "image/jpeg" },
      ],
    });
    expect(call.messages[1]).toEqual({ role: "assistant", content: "A1" });
  });

  test("quote is embedded in the user envelope", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const ai = new FakeAI();
    await guestAskHandler(baseInput({ storage, ai, quote: "как дела" }));
    const call = ai.calls[0] as { messages: { role: string; content: unknown }[] };
    expect(call.messages).toEqual([
      {
        role: "user",
        content: JSON.stringify({
          author: "Jane",
          quote: "как дела",
          text: "hello",
        }),
      },
    ]);
  });

  test("answered with priorThread: prepends prior turns to AI messages", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const ai = new FakeAI({ text: "ok", totalTokens: 1 });
    const priorThread = {
      chatId: "c1",
      turns: [{ userQuestion: "Q1", botAnswer: "A1" }],
      ts: 500,
    };
    await guestAskHandler(baseInput({ storage, ai, priorThread }));
    const call = ai.calls[0] as { messages: { role: string; content: unknown }[] };
    expect(call.messages).toEqual([
      { role: "user", content: "Q1" },
      { role: "assistant", content: "A1" },
      {
        role: "user",
        content: JSON.stringify({ author: "Jane", text: "hello" }),
      },
    ]);
  });

  test("answered with priorThread: persistThread appends the new turn", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const ai = new FakeAI({ text: "second answer", totalTokens: 1 });
    const priorThread = {
      chatId: "c1",
      turns: [{ userQuestion: "Q1", botAnswer: "A1" }],
      ts: 500,
    };
    const out = await guestAskHandler(
      baseInput({ storage, ai, priorThread, now: 2000 }),
    );
    if (out.kind !== "answered") throw new Error("expected answered");
    await out.persistThread();
    const stored = await storage.getGuestThread("c1");
    expect(stored?.turns).toEqual([
      { userQuestion: "Q1", botAnswer: "A1" },
      {
        userQuestion: JSON.stringify({ author: "Jane", text: "hello" }),
        botAnswer: "second answer",
      },
    ]);
    expect(stored?.ts).toBe(2000);
  });

  test("priorThread is capped at MAX_REPLY_CHAIN_DEPTH on persist and AI input", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const ai = new FakeAI({ text: "newest", totalTokens: 1 });
    const overflowTurns = Array.from({ length: MAX_REPLY_CHAIN_DEPTH + 5 }, (_, i) => ({
      userQuestion: `Q${i}`,
      botAnswer: `A${i}`,
    }));
    const priorThread = { chatId: "c1", turns: overflowTurns, ts: 500 };
    const out = await guestAskHandler(
      baseInput({ storage, ai, priorThread, now: 2000 }),
    );
    if (out.kind !== "answered") throw new Error("expected answered");

    const call = ai.calls[0] as { messages: { role: string; content: unknown }[] };
    expect(call.messages.length).toBe(MAX_REPLY_CHAIN_DEPTH * 2 + 1);
    expect(call.messages[0]).toEqual({
      role: "user",
      content: `Q${overflowTurns.length - MAX_REPLY_CHAIN_DEPTH}`,
    });

    await out.persistThread();
    const stored = await storage.getGuestThread("c1");
    expect(stored?.turns.length).toBe(MAX_REPLY_CHAIN_DEPTH);
    expect(stored?.turns[stored.turns.length - 1]?.botAnswer).toBe("newest");
    expect(stored?.turns[0]?.userQuestion).toBe(
      `Q${overflowTurns.length - MAX_REPLY_CHAIN_DEPTH + 1}`,
    );
  });

  test("answered: deducts tokens from bucket", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const rlStorage = new MemoryStorage();
    const rl = new DualWindowLimiter(rlStorage);
    const ai = new FakeAI({ text: "ok", totalTokens: 777 });
    const out = await guestAskHandler(
      baseInput({ storage, rateLimiter: rl, ai }),
    );
    expect(out.kind).toBe("answered");
    expect((await rlStorage.getUserUsage("42"))?.fiveHour.used).toBe(777);
  });

  test("answered: returns botName from chat settings", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    await storage.saveChatSettings("c1", { botName: "Helper" });
    const out = await guestAskHandler(baseInput({ storage }));
    if (out.kind !== "answered") throw new Error("expected answered");
    expect(out.botName).toBe("Helper");
  });

  test("answered.text is the raw AI Rich Markdown (no HTML sanitization)", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const ai = new FakeAI({ text: "<b>bold</b> & raw <script>x</script>", totalTokens: 1 });
    const out = await guestAskHandler(baseInput({ storage, ai }));
    if (out.kind !== "answered") throw new Error("expected answered");
    expect(out.text).toBe("<b>bold</b> & raw <script>x</script>");
  });

  test("AI is called with current settings (system, models, tools)", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    await storage.saveSettings({
      ...DEFAULT_SETTINGS,
      systemPrompt: "Pirate.",
      models: ["m1", "m2"],
    });
    const ai = new FakeAI();
    await guestAskHandler(baseInput({ storage, ai }));
    const call = ai.calls[0] as { models: string[]; system: string };
    expect(call.models).toEqual(["m1", "m2"]);
    expect(call.system).toContain("Pirate.");
  });

  test("answered: propagates tool effects recorded into ctx.effects", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });

    class EffectfulAI implements AIClient {
      async ask(opts: Parameters<AIClient["ask"]>[0]): Promise<AskResult> {
        opts.toolCallContext.effects?.push({
          type: "reminder_scheduled",
          fireAtMs: 999_000,
          timezone: "UTC",
        });
        return { text: "done", totalTokens: 1 };
      }
    }

    const out = await guestAskHandler(
      baseInput({ storage, ai: new EffectfulAI() }),
    );
    if (out.kind !== "answered") throw new Error("expected answered");
    expect(out.effects).toEqual([
      { type: "reminder_scheduled", fireAtMs: 999_000, timezone: "UTC" },
    ]);
  });

  test("onAIStart fires before AI call, but not when denied or rate-limited", async () => {
    const events: string[] = [];

    let out = await guestAskHandler(
      baseInput({ onAIStart: () => events.push("typing-denied") }),
    );
    expect(out.kind).toBe("denied");
    expect(events).toEqual([]);

    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const rlStorage = new MemoryStorage();
    await exhaustUsage(rlStorage, "42", 1000);
    const rl = new DualWindowLimiter(rlStorage);
    out = await guestAskHandler(
      baseInput({
        storage,
        rateLimiter: rl,
        onAIStart: () => events.push("typing-rl"),
      }),
    );
    expect(out.kind).toBe("rateLimited");
    expect(events).toEqual([]);

    const okStorage = new MemoryStorage();
    await okStorage.addWhitelist("users", { id: "42" });
    out = await guestAskHandler(
      baseInput({
        storage: okStorage,
        onAIStart: () => events.push("typing-ok"),
      }),
    );
    expect(out.kind).toBe("answered");
    expect(events).toEqual(["typing-ok"]);
  });
});
