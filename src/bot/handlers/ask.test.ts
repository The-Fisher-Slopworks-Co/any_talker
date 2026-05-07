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
  sender: { firstName: "John", lastName: "Doe" },
  userText: "hello",
  quote: null,
  replyTarget: null,
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

  test("rate-limit hit returns rateLimited", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const rlStorage = new MemoryStorage();
    await rlStorage.saveBucket("42", { tokens: 0, lastRefillTs: 1000 });
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
    await rlStorage.saveBucket("1", { tokens: 0, lastRefillTs: 1000 });
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
    await rlStorage.saveBucket("1", { tokens: 0, lastRefillTs: 1000 });
    const rl = new TokenBucketLimiter(rlStorage);
    const out = await askHandler(baseInput({ storage, userId: "1", rateLimiter: rl }));
    expect(out.kind).toBe("rateLimited");
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
        replyTarget: { messageId: 100, text: "A1", authorFirstName: "Bot" },
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

  test("answered: deducts tokens from bucket", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const rlStorage = new MemoryStorage();
    const rl = new TokenBucketLimiter(rlStorage);
    const ai = new FakeAI({ text: "ok", totalTokens: 1234 });
    const out = await askHandler(baseInput({ storage, rateLimiter: rl, ai }));
    expect(out.kind).toBe("answered");
    expect((await rlStorage.getBucket("42"))?.tokens).toBe(
      DEFAULT_SETTINGS.rateLimit.capacity - 1234,
    );
  });
});
