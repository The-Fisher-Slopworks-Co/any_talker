// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "../../storage/memory";
import { DualWindowLimiter } from "../../ratelimit/dual-window";
import { SpendBudgetGuard } from "../../budget/guard";
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
  await storage.usage.add(
    userId,
    DEFAULT_SETTINGS.rateLimit.fiveHourUsd,
    starts.fiveHour,
    starts.weekly,
  );
}

class FakeAI implements AIClient {
  constructor(
    public reply: AskResult = { text: "guest reply", totalTokens: 50 },
  ) {}
  calls: unknown[] = [];
  async ask(opts: Parameters<AIClient["ask"]>[0]): Promise<AskResult> {
    this.calls.push(opts);
    return this.reply;
  }
}

// Every envelope carries the moment its turn was sent (that stamp lives in the
// message, not in the system prompt, so the prompt stays cacheable). The
// fixtures sit a few ms past the epoch in the default UTC timezone.
const SENT_AT = "1970-01-01 00:00";

const TOKEN = "gTOKEN0001";

const baseInput = (overrides: Partial<GuestAskInput> = {}): GuestAskInput => {
  const storage = overrides.storage ?? new MemoryStorage();
  return {
    storage,
    rateLimiter: new DualWindowLimiter(new MemoryStorage()),
    budgetGuard: new SpendBudgetGuard(storage),
    ai: new FakeAI(),
    resolver: createMainPersonaResolver(storage),
    ownerId: "1",
    now: 1_000,
    chatId: "c1",
    userId: "42",
    sender: {
      firstName: "Jane",
      lastName: null,
      nameOverride: null,
      gender: null,
    },
    userText: "hello",
    quote: null,
    images: [],
    imageFileIds: [],
    replyImageFileIds: [],
    replyTarget: null,
    replyIsOwnAnswer: false,
    priorThread: null,
    priorToken: null,
    threadToken: TOKEN,
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
    await storage.access.addWhitelist("users", { id: "42" });
    const out = await guestAskHandler(baseInput({ storage, userText: "  " }));
    expect(out.kind).toBe("denied");
  });

  test("chat whitelist alone does NOT grant access in guest mode", async () => {
    const storage = new MemoryStorage();
    await storage.access.addWhitelist("chats", { id: "c1" });
    const out = await guestAskHandler(baseInput({ storage }));
    expect(out.kind).toBe("denied");
  });

  test("whitelisted user is answered", async () => {
    const storage = new MemoryStorage();
    await storage.access.addWhitelist("users", { id: "42" });
    const ai = new FakeAI({ text: "hi", totalTokens: 100 });
    const out = await guestAskHandler(baseInput({ storage, ai }));
    expect(out.kind).toBe("answered");
    if (out.kind === "answered") expect(out.text).toBe("hi");
  });

  test("blacklisted user denied even when whitelisted, with the reason for the log", async () => {
    const storage = new MemoryStorage();
    await storage.access.addWhitelist("users", { id: "42" });
    await storage.access.addBlacklist("users", { id: "42" });
    const out = await guestAskHandler(baseInput({ storage }));
    expect(out).toEqual({ kind: "denied", reason: "blacklisted" });
  });

  test("blacklisted chat denies its guests even when the user is whitelisted", async () => {
    const storage = new MemoryStorage();
    await storage.access.addWhitelist("users", { id: "42" });
    await storage.access.addBlacklist("chats", { id: "c1" });
    const out = await guestAskHandler(baseInput({ storage }));
    expect(out).toEqual({ kind: "denied", reason: "blacklisted" });
  });

  // Sent as a chat: identified by the sending chat (`bot/identity.ts`), so the
  // chat lists stand in for the user list on both sides of the gate.
  test("a blacklisted sending channel is denied in guest mode too", async () => {
    const storage = new MemoryStorage();
    await storage.access.addBlacklist("chats", { id: "-1001" });
    const out = await guestAskHandler(
      baseInput({ storage, userId: "-1001", senderChatId: "-1001" }),
    );
    expect(out).toEqual({ kind: "denied", reason: "blacklisted" });
  });

  test("a whitelisted sending channel is answered, an unlisted one is not", async () => {
    const storage = new MemoryStorage();
    await storage.access.addWhitelist("chats", { id: "-1001" });
    const ai = new FakeAI({ text: "hi", totalTokens: 100 });
    const allowed = await guestAskHandler(
      baseInput({ storage, ai, userId: "-1001", senderChatId: "-1001" }),
    );
    expect(allowed.kind).toBe("answered");
    const denied = await guestAskHandler(
      baseInput({ storage, ai, userId: "-2002", senderChatId: "-2002" }),
    );
    expect(denied).toEqual({ kind: "denied", reason: "not_whitelisted" });
  });

  test("an empty AI answer is an error turn, not an answered one (Telegram rejects empty messages)", async () => {
    const storage = new MemoryStorage();
    await storage.access.addWhitelist("users", { id: "42" });
    const ai = new FakeAI({ text: "  \n", totalTokens: 50 });
    const out = await guestAskHandler(baseInput({ storage, ai }));
    expect(out.kind).toBe("error");
  });

  test("owner with ownerExempt skips rate limit", async () => {
    const storage = new MemoryStorage();
    await storage.settings.save({
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
    await storage.settings.save({
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
    await storage.access.addWhitelist("users", { id: "42" });
    const rlStorage = new MemoryStorage();
    await exhaustUsage(rlStorage, "42", 1000);
    const rl = new DualWindowLimiter(rlStorage);
    const out = await guestAskHandler(baseInput({ storage, rateLimiter: rl }));
    expect(out.kind).toBe("rateLimited");
    if (out.kind === "rateLimited") expect(out.msUntilReset).toBeGreaterThan(0);
  });

  test("answered: records reported costUsd to the user's spend", async () => {
    const storage = new MemoryStorage();
    await storage.access.addWhitelist("users", { id: "42" });
    const ai = new FakeAI({ text: "hi", totalTokens: 50, costUsd: 0.02 });
    const out = await guestAskHandler(baseInput({ storage, ai }));
    expect(out.kind).toBe("answered");
    expect((await storage.spend.getUser("42", 1000)).day).toBeCloseTo(0.02, 6);
  });

  test("answered: records no spend when costUsd is absent", async () => {
    const storage = new MemoryStorage();
    await storage.access.addWhitelist("users", { id: "42" });
    const ai = new FakeAI({ text: "hi", totalTokens: 50 });
    await guestAskHandler(baseInput({ storage, ai }));
    expect((await storage.spend.getUser("42", 1000)).month).toBe(0);
  });

  test("passes the configured models to the AI", async () => {
    const storage = new MemoryStorage();
    await storage.access.addWhitelist("users", { id: "42" });
    const ai = new FakeAI();
    const out = await guestAskHandler(baseInput({ storage, ai }));
    expect(out.kind).toBe("answered");
    const call = ai.calls[0] as { models: string[] };
    expect(call.models).toEqual(DEFAULT_SETTINGS.models);
  });

  test("answered: persistThread stores a fresh thread under the answer's token", async () => {
    const storage = new MemoryStorage();
    await storage.access.addWhitelist("users", { id: "42" });
    const ai = new FakeAI({ text: "the answer", totalTokens: 200 });
    const out = await guestAskHandler(baseInput({ storage, ai }));
    expect(out.kind).toBe("answered");
    if (out.kind !== "answered") return;
    await out.persistThread();
    expect(await storage.conversations.getGuest(TOKEN)).toEqual({
      chatId: "c1",
      turns: [
        {
          userQuestion: JSON.stringify({
            author: "Jane",
            time: SENT_AT,
            text: "hello",
          }),
          botAnswer: "the answer",
          // Guest turns carry no detail level, so the run records only the ids
          // (none, from FakeAI) and the prompt hash.
          run: { gen: [], instr: expect.any(String) },
        },
      ],
      ts: 1000,
    });
  });

  test("reply to a non-bot message is surfaced as context before the question", async () => {
    const storage = new MemoryStorage();
    await storage.access.addWhitelist("users", { id: "42" });
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
    const call = ai.calls[0] as {
      messages: { role: string; content: unknown }[];
    };
    expect(call.messages).toEqual([
      {
        role: "user",
        content: "Context (replied message from Bob): how are you?",
      },
      {
        role: "user",
        content: JSON.stringify({
          author: "Jane",
          time: SENT_AT,
          text: "hello",
        }),
      },
    ]);
  });

  test("replyTarget falls back to placeholders for missing author/text", async () => {
    const storage = new MemoryStorage();
    await storage.access.addWhitelist("users", { id: "42" });
    const ai = new FakeAI();
    await guestAskHandler(
      baseInput({
        storage,
        ai,
        replyTarget: {
          messageId: 7,
          text: null,
          authorFirstName: null,
          images: [],
        },
      }),
    );
    const call = ai.calls[0] as {
      messages: { role: string; content: unknown }[];
    };
    expect(call.messages[0]).toEqual({
      role: "user",
      content: "Context (replied message from unknown): <media>",
    });
  });

  test("stored thread wins over replyTarget (no duplicate context header)", async () => {
    const storage = new MemoryStorage();
    await storage.access.addWhitelist("users", { id: "42" });
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
        replyTarget: {
          messageId: 7,
          text: "A1",
          authorFirstName: "Bot",
          images: [],
        },
      }),
    );
    const call = ai.calls[0] as {
      messages: { role: string; content: unknown }[];
    };
    expect(call.messages).toEqual([
      { role: "user", content: "Q1" },
      { role: "assistant", content: "A1" },
      {
        role: "user",
        content: JSON.stringify({
          author: "Jane",
          time: SENT_AT,
          text: "hello",
        }),
      },
    ]);
  });

  test("own answer with no stored thread is quoted as the model's own, bot name cut", async () => {
    const storage = new MemoryStorage();
    await storage.access.addWhitelist("users", { id: "42" });
    const ai = new FakeAI();
    await guestAskHandler(
      baseInput({
        storage,
        ai,
        resolver: async () => ({
          settings: DEFAULT_SETTINGS,
          botName: "Helper",
        }),
        replyIsOwnAnswer: true,
        // What Telegram shows: bot-name line + rendered body.
        replyTarget: {
          messageId: 7,
          text: "Helper\n\nПривет, Jane!",
          authorFirstName: "Bot",
          images: [],
        },
      }),
    );
    const call = ai.calls[0] as {
      messages: { role: string; content: unknown }[];
    };
    expect(call.messages).toEqual([
      {
        role: "user",
        content:
          "Context (replied message from you, the assistant): Привет, Jane!",
      },
      {
        role: "user",
        content: JSON.stringify({
          author: "Jane",
          time: SENT_AT,
          text: "hello",
        }),
      },
    ]);
  });

  test("a text-less own answer is still attributed to the model", async () => {
    const storage = new MemoryStorage();
    await storage.access.addWhitelist("users", { id: "42" });
    const ai = new FakeAI();
    await guestAskHandler(
      baseInput({
        storage,
        ai,
        replyIsOwnAnswer: true,
        replyTarget: {
          messageId: 7,
          text: null,
          authorFirstName: "Bot",
          images: [],
        },
      }),
    );
    const call = ai.calls[0] as {
      messages: { role: string; content: unknown }[];
    };
    expect(call.messages[0]).toEqual({
      role: "user",
      content: "Context (replied message from you, the assistant): <media>",
    });
  });

  test("two conversations in one chat stay apart, and a reply resumes only its own", async () => {
    const storage = new MemoryStorage();
    await storage.access.addWhitelist("users", { id: "42" });
    await storage.access.addWhitelist("users", { id: "43" });
    const turn = async (overrides: Partial<GuestAskInput>, answer: string) => {
      const ai = new FakeAI({ text: answer, totalTokens: 1 });
      const out = await guestAskHandler(
        baseInput({ storage, ai, ...overrides }),
      );
      if (out.kind !== "answered") throw new Error(`unexpected ${out.kind}`);
      await out.persistThread();
      return ai;
    };
    await turn({ userText: "film?", threadToken: "gFILM00001" }, "Knives Out");
    await turn(
      { userId: "43", userText: "tap?", threadToken: "gTAP000001" },
      "Replace the washer",
    );
    // Jane replies to the film answer after the tap one was posted.
    const ai = await turn(
      {
        userText: "scarier?",
        threadToken: "gFILM00002",
        priorToken: "gFILM00001",
        priorThread: await storage.conversations.getGuest("gFILM00001"),
        replyIsOwnAnswer: true,
        replyTarget: {
          messageId: 7,
          text: "Knives Out",
          authorFirstName: "Bot",
          images: [],
        },
      },
      "Hereditary",
    );

    const call = ai.calls[0] as {
      messages: { role: string; content: string }[];
    };
    expect(call.messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "user",
    ]);
    expect(call.messages[1]?.content).toBe("Knives Out");
    const answers = async (token: string) =>
      (await storage.conversations.getGuest(token))?.turns.map(
        (t) => t.botAnswer,
      );
    expect(await answers("gFILM00002")).toEqual(["Knives Out", "Hereditary"]);
    // The answers replied to earlier keep their own threads untouched.
    expect(await answers("gFILM00001")).toEqual(["Knives Out"]);
    expect(await answers("gTAP000001")).toEqual(["Replace the washer"]);
  });

  test("empty text with a replyTarget is answered, not denied (bare-mention reply)", async () => {
    const storage = new MemoryStorage();
    await storage.access.addWhitelist("users", { id: "42" });
    const ai = new FakeAI();
    const out = await guestAskHandler(
      baseInput({
        storage,
        ai,
        userText: "",
        replyTarget: {
          messageId: 7,
          text: "hi",
          authorFirstName: "Bob",
          images: [],
        },
      }),
    );
    expect(out.kind).toBe("answered");
  });

  test("empty text with an image attached is answered, not denied", async () => {
    const storage = new MemoryStorage();
    await storage.access.addWhitelist("users", { id: "42" });
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
    await storage.access.addWhitelist("users", { id: "42" });
    const ai = new FakeAI();
    const img = new Uint8Array([1, 2]);
    const voice = new Uint8Array([3, 4]);
    await guestAskHandler(
      baseInput({
        storage,
        ai,
        images: [img],
        audios: [voice],
        imageFileIds: ["f1"],
      }),
    );
    const call = ai.calls[0] as {
      messages: { role: string; content: unknown }[];
    };
    expect(call.messages).toEqual([
      {
        role: "user",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              author: "Jane",
              time: SENT_AT,
              text: "hello",
            }),
          },
          { type: "image", image: img, mediaType: "image/jpeg" },
          { type: "audio", audio: voice, mediaType: "audio/mp3" },
        ],
      },
    ]);
  });

  test("replied-to images and audio ride along with the context header", async () => {
    const storage = new MemoryStorage();
    await storage.access.addWhitelist("users", { id: "42" });
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
    const call = ai.calls[0] as {
      messages: { role: string; content: unknown }[];
    };
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
    await storage.access.addWhitelist("users", { id: "42" });
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
    const stored = await storage.conversations.getGuest(TOKEN);
    expect(stored?.turns[0]?.userImageFileIds).toEqual([
      "own1",
      "reply1",
      "reply2",
    ]);
  });

  test("prior-turn image file ids are re-fetched and attached to the chain", async () => {
    const storage = new MemoryStorage();
    await storage.access.addWhitelist("users", { id: "42" });
    const ai = new FakeAI();
    const img = new Uint8Array([7, 7]);
    const fetched: string[] = [];
    const priorThread = {
      chatId: "c1",
      turns: [
        { userQuestion: "Q1", botAnswer: "A1", userImageFileIds: ["old1"] },
      ],
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
    const call = ai.calls[0] as {
      messages: { role: string; content: unknown }[];
    };
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
    await storage.access.addWhitelist("users", { id: "42" });
    const ai = new FakeAI();
    await guestAskHandler(baseInput({ storage, ai, quote: "как дела" }));
    const call = ai.calls[0] as {
      messages: { role: string; content: unknown }[];
    };
    expect(call.messages).toEqual([
      {
        role: "user",
        content: JSON.stringify({
          author: "Jane",
          time: SENT_AT,
          quote: "как дела",
          text: "hello",
        }),
      },
    ]);
  });

  test("answered with priorThread: prepends prior turns to AI messages", async () => {
    const storage = new MemoryStorage();
    await storage.access.addWhitelist("users", { id: "42" });
    const ai = new FakeAI({ text: "ok", totalTokens: 1 });
    const priorThread = {
      chatId: "c1",
      turns: [{ userQuestion: "Q1", botAnswer: "A1" }],
      ts: 500,
    };
    await guestAskHandler(baseInput({ storage, ai, priorThread }));
    const call = ai.calls[0] as {
      messages: { role: string; content: unknown }[];
    };
    expect(call.messages).toEqual([
      { role: "user", content: "Q1" },
      { role: "assistant", content: "A1" },
      {
        role: "user",
        content: JSON.stringify({
          author: "Jane",
          time: SENT_AT,
          text: "hello",
        }),
      },
    ]);
  });

  test("answered with priorThread: persistThread appends the new turn", async () => {
    const storage = new MemoryStorage();
    await storage.access.addWhitelist("users", { id: "42" });
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
    const stored = await storage.conversations.getGuest(TOKEN);
    expect(stored?.turns).toEqual([
      { userQuestion: "Q1", botAnswer: "A1" },
      {
        userQuestion: JSON.stringify({
          author: "Jane",
          time: SENT_AT,
          text: "hello",
        }),
        botAnswer: "second answer",
        run: { gen: [], instr: expect.any(String) },
      },
    ]);
    expect(stored?.ts).toBe(2000);
  });

  test("priorThread is capped at MAX_REPLY_CHAIN_DEPTH on persist and AI input", async () => {
    const storage = new MemoryStorage();
    await storage.access.addWhitelist("users", { id: "42" });
    const ai = new FakeAI({ text: "newest", totalTokens: 1 });
    const overflowTurns = Array.from(
      { length: MAX_REPLY_CHAIN_DEPTH + 5 },
      (_, i) => ({
        userQuestion: `Q${i}`,
        botAnswer: `A${i}`,
      }),
    );
    const priorThread = { chatId: "c1", turns: overflowTurns, ts: 500 };
    const out = await guestAskHandler(
      baseInput({ storage, ai, priorThread, now: 2000 }),
    );
    if (out.kind !== "answered") throw new Error("expected answered");

    const call = ai.calls[0] as {
      messages: { role: string; content: unknown }[];
    };
    expect(call.messages.length).toBe(MAX_REPLY_CHAIN_DEPTH * 2 + 1);
    expect(call.messages[0]).toEqual({
      role: "user",
      content: `Q${overflowTurns.length - MAX_REPLY_CHAIN_DEPTH}`,
    });

    await out.persistThread();
    const stored = await storage.conversations.getGuest(TOKEN);
    expect(stored?.turns.length).toBe(MAX_REPLY_CHAIN_DEPTH);
    expect(stored?.turns[stored.turns.length - 1]?.botAnswer).toBe("newest");
    expect(stored?.turns[0]?.userQuestion).toBe(
      `Q${overflowTurns.length - MAX_REPLY_CHAIN_DEPTH + 1}`,
    );
  });

  test("answered: deducts the reply cost from the usage windows", async () => {
    const storage = new MemoryStorage();
    await storage.access.addWhitelist("users", { id: "42" });
    const rlStorage = new MemoryStorage();
    const rl = new DualWindowLimiter(rlStorage);
    const ai = new FakeAI({ text: "ok", totalTokens: 777, costUsd: 0.0031 });
    const out = await guestAskHandler(
      baseInput({ storage, rateLimiter: rl, ai }),
    );
    expect(out.kind).toBe("answered");
    expect((await rlStorage.usage.get("42"))?.fiveHour.used).toBe(0.0031);
  });

  test("answered: returns botName from chat settings", async () => {
    const storage = new MemoryStorage();
    await storage.access.addWhitelist("users", { id: "42" });
    await storage.chats.saveSettings("c1", { botName: "Helper" });
    const out = await guestAskHandler(baseInput({ storage }));
    if (out.kind !== "answered") throw new Error("expected answered");
    expect(out.botName).toBe("Helper");
  });

  test("answered.text is the raw AI Rich Markdown (no HTML sanitization)", async () => {
    const storage = new MemoryStorage();
    await storage.access.addWhitelist("users", { id: "42" });
    const ai = new FakeAI({
      text: "<b>bold</b> & raw <script>x</script>",
      totalTokens: 1,
    });
    const out = await guestAskHandler(baseInput({ storage, ai }));
    if (out.kind !== "answered") throw new Error("expected answered");
    expect(out.text).toBe("<b>bold</b> & raw <script>x</script>");
  });

  test("AI is called with current settings (system, models, tools)", async () => {
    const storage = new MemoryStorage();
    await storage.access.addWhitelist("users", { id: "42" });
    await storage.settings.save({
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
    await storage.access.addWhitelist("users", { id: "42" });

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
    await storage.access.addWhitelist("users", { id: "42" });
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
    await okStorage.access.addWhitelist("users", { id: "42" });
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

// Guest threads carry the same defect the reply chain had: the turn stored the
// question and the answer, and whatever a tool fetched was gone by the next
// message.
describe("guestAskHandler — tool calls on the stored thread", () => {
  const RECORDS = [
    {
      callId: "call_1",
      name: "fetch_page",
      arguments: '{"url":"https://e.x"}',
      output: '"Alice 113\\nBob 111\\nCarol 107"',
    },
  ];

  test("persistThread keeps the turn's tool calls", async () => {
    const storage = new MemoryStorage();
    await storage.access.addWhitelist("users", { id: "42" });
    const ai = new FakeAI({
      text: "three of them got in",
      totalTokens: 1,
      toolCalls: RECORDS,
    });

    const out = await guestAskHandler(baseInput({ storage, ai }));
    if (out.kind !== "answered") throw new Error(`unexpected ${out.kind}`);
    await out.persistThread();

    expect(
      (await storage.conversations.getGuest(TOKEN))!.turns[0]!.toolCalls,
    ).toEqual(RECORDS);
  });

  test("a turn that called no tools stores no key at all", async () => {
    const storage = new MemoryStorage();
    await storage.access.addWhitelist("users", { id: "42" });
    const ai = new FakeAI({ text: "plain", totalTokens: 1, toolCalls: [] });

    const out = await guestAskHandler(baseInput({ storage, ai }));
    if (out.kind !== "answered") throw new Error(`unexpected ${out.kind}`);
    await out.persistThread();

    expect(
      (await storage.conversations.getGuest(TOKEN))!.turns[0]!.toolCalls,
    ).toBeUndefined();
  });

  test("a stored turn's tool results reach the next prompt", async () => {
    const storage = new MemoryStorage();
    await storage.access.addWhitelist("users", { id: "42" });
    const ai = new FakeAI();
    await guestAskHandler(
      baseInput({
        storage,
        ai,
        priorThread: {
          chatId: "c1",
          turns: [{ userQuestion: "Q1", botAnswer: "A1", toolCalls: RECORDS }],
          ts: 500,
        },
        userText: "you missed someone",
      }),
    );

    const sent = (ai.calls[0] as { messages: unknown[] }).messages;
    expect(JSON.stringify(sent)).toContain("Carol 107");
    // Question, transcript, answer, then the new question.
    expect(sent).toHaveLength(4);
  });
});

// As on a conversation node (issue #116) — a guest turn is just as reportable,
// and its thread is the only record of it.
describe("guestAskHandler — the run on the stored turn", () => {
  test("persistThread keeps the ids and the answering model, and no detail level", async () => {
    const storage = new MemoryStorage();
    await storage.access.addWhitelist("users", { id: "42" });
    const ai = new FakeAI({
      text: "the answer",
      totalTokens: 1,
      generations: ["gen-1789064870-zJbTnX"],
      answeredBy: "anthropic/claude-sonnet-4.5",
    });

    const out = await guestAskHandler(baseInput({ storage, ai }));
    if (out.kind !== "answered") throw new Error(`unexpected ${out.kind}`);
    await out.persistThread();

    const turn = (await storage.conversations.getGuest(TOKEN))!.turns[0]!;
    // Guest queries are always single-turn asks with no detail level, so the
    // key is absent rather than set to the "short"-equivalent path it takes.
    expect(turn.run).toEqual({
      gen: ["gen-1789064870-zJbTnX"],
      model: "anthropic/claude-sonnet-4.5",
      instr: expect.any(String),
    });
  });

  test("a replayed thread ignores the stored run", async () => {
    const storage = new MemoryStorage();
    await storage.access.addWhitelist("users", { id: "42" });
    const ai = new FakeAI();
    await guestAskHandler(
      baseInput({
        storage,
        ai,
        priorThread: {
          chatId: "c1",
          turns: [
            {
              userQuestion: "Q1",
              botAnswer: "A1",
              run: {
                gen: ["gen-1789064867-b8Jgaf"],
                instr: "d1e181d3faa2c130",
              },
            },
          ],
          ts: 500,
        },
      }),
    );

    const sent = (ai.calls[0] as { messages: unknown[] }).messages;
    expect(sent.slice(0, 2)).toEqual([
      { role: "user", content: "Q1" },
      { role: "assistant", content: "A1" },
    ]);
    expect(JSON.stringify(sent)).not.toContain("gen-");
  });
});

// Issue #116: a guest thread is as reportable as a chain, so it goes into the
// same per-user index — tagged, because it is keyed by token, not message id.
describe("guestAskHandler — the user's thread index", () => {
  test("persistThread indexes the guest thread in the answering bot's scope", async () => {
    const storage = new MemoryStorage();
    await storage.access.addWhitelist("users", { id: "42" });
    const out = await guestAskHandler(baseInput({ storage, botId: "cat-bot" }));
    if (out.kind !== "answered") throw new Error(`unexpected ${out.kind}`);
    await out.persistThread();
    expect(await storage.conversations.listUserThreads("42")).toEqual([
      {
        kind: "guest",
        chatId: "c1",
        botId: "cat-bot",
        token: TOKEN,
        ts: 1000,
      },
    ]);
    // The scope the entry names is the one holding the thread.
    expect(
      await storage.forBot("cat-bot").conversations.getGuest(TOKEN),
    ).not.toBeNull();
  });

  test("a reply advances the thread's entry rather than adding another", async () => {
    const storage = new MemoryStorage();
    await storage.access.addWhitelist("users", { id: "42" });
    const first = await guestAskHandler(baseInput({ storage }));
    if (first.kind !== "answered") throw new Error(`unexpected ${first.kind}`);
    await first.persistThread();

    const second = await guestAskHandler(
      baseInput({
        storage,
        now: 2_000,
        userText: "and then?",
        priorThread: await storage.conversations.getGuest(TOKEN),
        priorToken: TOKEN,
        threadToken: "gTOKEN0002",
      }),
    );
    if (second.kind !== "answered")
      throw new Error(`unexpected ${second.kind}`);
    await second.persistThread();

    expect(await storage.conversations.listUserThreads("42")).toEqual([
      {
        kind: "guest",
        chatId: "c1",
        botId: null,
        token: "gTOKEN0002",
        ts: 2000,
      },
    ]);
  });
});
