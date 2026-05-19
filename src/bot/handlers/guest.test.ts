// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "../../storage/memory";
import { TokenBucketLimiter } from "../../ratelimit/token-bucket";
import type { AIClient, AskResult } from "../../ai/types";
import { guestAskHandler, type GuestAskInput } from "./guest";
import { DEFAULT_SETTINGS, MAX_REPLY_CHAIN_DEPTH } from "../../shared/types";

class FakeAI implements AIClient {
  constructor(public reply: AskResult = { text: "guest reply", totalTokens: 50 }) {}
  calls: unknown[] = [];
  async ask(opts: Parameters<AIClient["ask"]>[0]): Promise<AskResult> {
    this.calls.push(opts);
    return this.reply;
  }
}

const baseInput = (overrides: Partial<GuestAskInput> = {}): GuestAskInput => ({
  storage: new MemoryStorage(),
  rateLimiter: new TokenBucketLimiter(new MemoryStorage()),
  ai: new FakeAI(),
  ownerId: "1",
  now: 1_000,
  chatId: "c1",
  userId: "42",
  sender: { firstName: "Jane", lastName: null, nameOverride: null, gender: null },
  userText: "hello",
  priorThread: null,
  lang: "en",
  ...overrides,
});

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

  test("owner with ownerExempt skips rate limit", async () => {
    const storage = new MemoryStorage();
    await storage.saveSettings({
      ...DEFAULT_SETTINGS,
      rateLimit: { ...DEFAULT_SETTINGS.rateLimit, ownerExempt: true },
    });
    const rlStorage = new MemoryStorage();
    await rlStorage.saveBucket("c1", "1", { tokens: 0, lastRefillTs: 1000 });
    const rl = new TokenBucketLimiter(rlStorage);
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
    await rlStorage.saveBucket("c1", "1", { tokens: 0, lastRefillTs: 1000 });
    const rl = new TokenBucketLimiter(rlStorage);
    const out = await guestAskHandler(
      baseInput({ storage, userId: "1", rateLimiter: rl }),
    );
    expect(out.kind).toBe("rateLimited");
  });

  test("rate-limit hit returns rateLimited", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const rlStorage = new MemoryStorage();
    await rlStorage.saveBucket("c1", "42", { tokens: 0, lastRefillTs: 1000 });
    const rl = new TokenBucketLimiter(rlStorage);
    const out = await guestAskHandler(
      baseInput({ storage, rateLimiter: rl }),
    );
    expect(out.kind).toBe("rateLimited");
    if (out.kind === "rateLimited")
      expect(out.minutesUntilNextRefill).toBeGreaterThan(0);
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
    const rl = new TokenBucketLimiter(rlStorage);
    const ai = new FakeAI({ text: "ok", totalTokens: 777 });
    const out = await guestAskHandler(
      baseInput({ storage, rateLimiter: rl, ai }),
    );
    expect(out.kind).toBe("answered");
    expect((await rlStorage.getBucket("c1", "42"))?.tokens).toBe(
      DEFAULT_SETTINGS.rateLimit.capacity - 777,
    );
  });

  test("answered: returns botName from chat settings", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    await storage.saveChatSettings("c1", { botName: "Helper" });
    const out = await guestAskHandler(baseInput({ storage }));
    if (out.kind !== "answered") throw new Error("expected answered");
    expect(out.botName).toBe("Helper");
  });

  test("AI receives sanitized HTML in answered.text", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const ai = new FakeAI({ text: "<b>bold</b> & raw <script>x</script>", totalTokens: 1 });
    const out = await guestAskHandler(baseInput({ storage, ai }));
    if (out.kind !== "answered") throw new Error("expected answered");
    expect(out.text).toBe("<b>bold</b> &amp; raw &lt;script&gt;x&lt;/script&gt;");
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
    await rlStorage.saveBucket("c1", "42", { tokens: 0, lastRefillTs: 1000 });
    const rl = new TokenBucketLimiter(rlStorage);
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
