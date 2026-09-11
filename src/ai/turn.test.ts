// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe, afterEach } from "bun:test";
import { z } from "zod";
import { MemoryStorage } from "../storage/memory";
import type { Storage, SpendStore } from "../storage/types";
import { DualWindowLimiter } from "../ratelimit/dual-window";
import type { AIClient, AIMessage, AskResult } from "./types";
import type { RateLimiter } from "../ratelimit/types";
import { runAiTurn, type RunAiTurnInput } from "./turn";
import { instructionHash } from "./instruction";
import { conversationSessionId } from "./session";
import {
  registerTool,
  _resetRegistryForTest,
  type Tool,
} from "./tools/registry";
import { DEFAULT_SETTINGS } from "../shared/types";

// Records the opts it was asked with and returns a fixed reply. `onAsk` runs
// during the call so a test can simulate a tool pushing an effect onto the
// shared context, exactly as the real tool-calling loop does.
class FakeAI implements AIClient {
  calls: Parameters<AIClient["ask"]>[0][] = [];
  constructor(
    private readonly reply: AskResult = { text: "reply", totalTokens: 100 },
    private readonly onAsk?: (opts: Parameters<AIClient["ask"]>[0]) => void,
  ) {}
  async ask(opts: Parameters<AIClient["ask"]>[0]): Promise<AskResult> {
    this.calls.push(opts);
    this.onAsk?.(opts);
    return this.reply;
  }
}

const baseInput = (overrides: Partial<RunAiTurnInput> = {}): RunAiTurnInput => {
  const storage = overrides.storage ?? new MemoryStorage();
  return {
    ai: new FakeAI(),
    rateLimiter: new DualWindowLimiter(new MemoryStorage()),
    storage,
    models: DEFAULT_SETTINGS.models,
    systemPrompt: "Test persona.",
    rateLimit: DEFAULT_SETTINGS.rateLimit,
    userId: "42",
    ownerId: "1",
    chatId: "c1",
    botId: null,
    source: "ask",
    replyToMessageId: 7,
    timezone: "Europe/Moscow",
    lang: "en",
    now: 1_000,
    messages: [{ role: "user", content: "hi" }],
    ...overrides,
  };
};

describe("runAiTurn — request assembly", () => {
  afterEach(() => _resetRegistryForTest());

  test("forwards the caller's provider routing to the client", async () => {
    const ai = new FakeAI();
    await runAiTurn(
      baseInput({
        ai,
        routing: {
          providerSort: "price",
          provider: "deepinfra",
          serviceTier: "flex",
        },
      }),
    );
    expect(ai.calls[0]?.routing).toEqual({
      providerSort: "price",
      provider: "deepinfra",
      serviceTier: "flex",
    });
  });

  test("omits routing entirely when the caller has none", async () => {
    const ai = new FakeAI();
    await runAiTurn(baseInput({ ai }));
    expect(ai.calls[0]?.routing).toBeUndefined();
  });

  // The sticky-routing key every call site gets for free, so a conversation
  // keeps landing on the provider whose prompt cache is warm for it.
  test("derives the session id from the answering bot and the chat", async () => {
    const ai = new FakeAI();
    await runAiTurn(baseInput({ ai, botId: "777", chatId: "-100123" }));
    expect(ai.calls[0]?.sessionId).toBe(
      conversationSessionId("777", "-100123"),
    );
  });

  test("the main bot's session id is distinct from a managed bot's", async () => {
    const main = new FakeAI();
    const managed = new FakeAI();
    await runAiTurn(baseInput({ ai: main, botId: null, chatId: "-100123" }));
    await runAiTurn(
      baseInput({ ai: managed, botId: "777", chatId: "-100123" }),
    );
    expect(main.calls[0]?.sessionId).not.toBe(managed.calls[0]?.sessionId);
  });

  test("wires every registered tool into the ai.ask call", async () => {
    _resetRegistryForTest();
    const dummy: Tool = {
      name: "dummy",
      description: "d",
      parameters: z.object({}),
      execute: async () => "ok",
    };
    registerTool(dummy);
    const ai = new FakeAI();
    await runAiTurn(baseInput({ ai }));
    expect(ai.calls[0]!.tools.map((t) => t.name)).toEqual(["dummy"]);
  });

  // A tool that declares `sources` is offered only there — the mechanism that
  // keeps reminder writes out of a delivery turn (#119).
  test("withholds a tool from a source it does not declare", async () => {
    _resetRegistryForTest();
    registerTool({
      name: "everywhere",
      description: "d",
      parameters: z.object({}),
      execute: async () => "ok",
    });
    registerTool({
      name: "ask_only",
      description: "d",
      parameters: z.object({}),
      execute: async () => "ok",
      sources: ["ask"],
    });

    const asked = new FakeAI();
    await runAiTurn(baseInput({ ai: asked, source: "ask" }));
    expect(asked.calls[0]!.tools.map((t) => t.name)).toEqual([
      "everywhere",
      "ask_only",
    ]);

    const delivered = new FakeAI();
    await runAiTurn(baseInput({ ai: delivered, source: "reminder_delivery" }));
    expect(delivered.calls[0]!.tools.map((t) => t.name)).toEqual([
      "everywhere",
    ]);
  });

  test("builds the system prompt from the persona + composes the context fields (ask source)", async () => {
    const ai = new FakeAI();
    const messages: AIMessage[] = [{ role: "user", content: "q" }];
    await runAiTurn(
      baseInput({
        ai,
        messages,
        contextMessages: messages,
        source: "ask",
        detailLevel: "short",
        botId: "cat-bot",
        replyToMessageId: 7,
      }),
    );
    const opts = ai.calls[0]!;
    expect(opts.models).toEqual(DEFAULT_SETTINGS.models);
    // The exact array passed through, not a copy.
    expect(opts.messages).toBe(messages);
    expect(opts.system).toContain("Test persona.");
    expect(opts.system).toContain("# Формат сообщений");
    expect(opts.system).toContain("# Формат ответа");
    expect(opts.toolCallContext).toMatchObject({
      source: "ask",
      chatId: "c1",
      userId: "42",
      botId: "cat-bot",
      replyToMessageId: 7,
      timezone: "Europe/Moscow",
      lang: "en",
      now: 1_000,
    });
    expect(opts.toolCallContext.contextMessages).toBe(messages);
  });

  test("detailLevel drives the detail section + reasoning effort (short)", async () => {
    const ai = new FakeAI();
    await runAiTurn(baseInput({ ai, detailLevel: "short" }));
    const opts = ai.calls[0]!;
    expect(opts.system).toContain("# Уровень подробности");
    expect(opts.reasoningEffort).toBe("low");
  });

  test("detailLevel wise selects high reasoning effort", async () => {
    const ai = new FakeAI();
    await runAiTurn(baseInput({ ai, detailLevel: "wise" }));
    expect(ai.calls[0]!.reasoningEffort).toBe("high");
  });

  test("no detailLevel: no detail section and no reasoning effort (guest/delivery path)", async () => {
    const ai = new FakeAI();
    await runAiTurn(baseInput({ ai, source: "guest" }));
    const opts = ai.calls[0]!;
    expect(opts.system).not.toContain("# Уровень подробности");
    expect(opts.reasoningEffort).toBeUndefined();
  });

  test("facts are surfaced in the system prompt when provided", async () => {
    const ai = new FakeAI();
    await runAiTurn(
      baseInput({ ai, facts: [{ key: "city", value: "Kazan" }] }),
    );
    const sys = ai.calls[0]!.system;
    expect(sys).toContain("# Что я знаю о пользователе");
    expect(sys).toContain("city: «Kazan»");
  });

  test("contextMessages is omitted from the tool context when not passed", async () => {
    const ai = new FakeAI();
    await runAiTurn(baseInput({ ai }));
    expect(ai.calls[0]!.toolCallContext.contextMessages).toBeUndefined();
  });
});

describe("runAiTurn — token deduction", () => {
  test("deducts the raw token total for a normal user (multiplier 1)", async () => {
    const rlStorage = new MemoryStorage();
    await runAiTurn(
      baseInput({
        rateLimiter: new DualWindowLimiter(rlStorage),
        ai: new FakeAI({ text: "ok", totalTokens: 500 }),
      }),
    );
    expect((await rlStorage.usage.get("42"))?.fiveHour.used).toBe(500);
  });

  test("owner with ownerExempt skips the deduction", async () => {
    const rlStorage = new MemoryStorage();
    await runAiTurn(
      baseInput({
        rateLimiter: new DualWindowLimiter(rlStorage),
        userId: "1",
        ownerId: "1",
        rateLimit: { ...DEFAULT_SETTINGS.rateLimit, ownerExempt: true },
        ai: new FakeAI({ text: "ok", totalTokens: 300 }),
      }),
    );
    expect(await rlStorage.usage.get("1")).toBeNull();
  });

  test("owner without ownerExempt is still deducted", async () => {
    const rlStorage = new MemoryStorage();
    await runAiTurn(
      baseInput({
        rateLimiter: new DualWindowLimiter(rlStorage),
        userId: "1",
        ownerId: "1",
        rateLimit: { ...DEFAULT_SETTINGS.rateLimit, ownerExempt: false },
        ai: new FakeAI({ text: "ok", totalTokens: 300 }),
      }),
    );
    expect((await rlStorage.usage.get("1"))?.fiveHour.used).toBe(300);
  });

  test("wise detail level scales the deduction by wiseMultiplier (rounded)", async () => {
    const rlStorage = new MemoryStorage();
    await runAiTurn(
      baseInput({
        rateLimiter: new DualWindowLimiter(rlStorage),
        rateLimit: { ...DEFAULT_SETTINGS.rateLimit, wiseMultiplier: 1.8 },
        detailLevel: "wise",
        ai: new FakeAI({ text: "ok", totalTokens: 1000 }),
      }),
    );
    expect((await rlStorage.usage.get("42"))?.fiveHour.used).toBe(1800);
  });

  test("short detail level deducts the raw total (multiplier 1)", async () => {
    const rlStorage = new MemoryStorage();
    await runAiTurn(
      baseInput({
        rateLimiter: new DualWindowLimiter(rlStorage),
        rateLimit: { ...DEFAULT_SETTINGS.rateLimit, wiseMultiplier: 10 },
        detailLevel: "short",
        ai: new FakeAI({ text: "ok", totalTokens: 1000 }),
      }),
    );
    expect((await rlStorage.usage.get("42"))?.fiveHour.used).toBe(1000);
  });

  test("a deduction failure propagates by default", async () => {
    const throwingLimiter: RateLimiter = {
      check: async () => ({ allowed: true }),
      deduct: async () => {
        throw new Error("deduct down");
      },
      reset: async () => {},
    };
    await expect(
      runAiTurn(baseInput({ rateLimiter: throwingLimiter })),
    ).rejects.toThrow("deduct down");
  });

  test("bestEffortDeduct swallows a deduction failure so the turn still completes", async () => {
    const throwingLimiter: RateLimiter = {
      check: async () => ({ allowed: true }),
      deduct: async () => {
        throw new Error("deduct down");
      },
      reset: async () => {},
    };
    const res = await runAiTurn(
      baseInput({ rateLimiter: throwingLimiter, bestEffortDeduct: true }),
    );
    expect(res.text).toBe("reply");
  });
});

describe("runAiTurn — spend booking", () => {
  test("books cost across the user/chat/global/model ledgers", async () => {
    const storage = new MemoryStorage();
    await runAiTurn(
      baseInput({
        storage,
        ai: new FakeAI({
          text: "ok",
          totalTokens: 100,
          modelId: "m1",
          costUsd: 0.5,
          priced: true,
        }),
      }),
    );
    expect((await storage.spend.getUser("42", 1_000)).day).toBeCloseTo(0.5);
    expect((await storage.spend.getChat("c1", 1_000)).day).toBeCloseTo(0.5);
    expect((await storage.spend.getGlobal(1_000)).day).toBeCloseTo(0.5);
    expect((await storage.spend.getModel("m1", 1_000)).day).toBeCloseTo(0.5);
    expect(await storage.spend.listModels()).toEqual(["m1"]);
    expect(await storage.spend.listUnpriced()).toEqual([]);
  });

  test("defaults missing modelId/costUsd/priced (no model attribution, $0, priced)", async () => {
    const storage = new MemoryStorage();
    const res = await runAiTurn(
      baseInput({
        storage,
        ai: new FakeAI({ text: "ok", totalTokens: 100 }),
      }),
    );
    // costUsd defaults to 0 → user/chat/global ledgers record nothing.
    expect((await storage.spend.getUser("42", 1_000)).month).toBe(0);
    expect((await storage.spend.getGlobal(1_000)).day).toBe(0);
    // modelId defaults to null → no per-model attribution, nothing flagged.
    expect(await storage.spend.listModels()).toEqual([]);
    expect(await storage.spend.listUnpriced()).toEqual([]);
    // The defaults are also surfaced on the returned result.
    expect(res.modelId).toBeNull();
    expect(res.costUsd).toBe(0);
    expect(res.priced).toBe(true);
  });

  test("an unpriced model is flagged and records $0", async () => {
    const storage = new MemoryStorage();
    await runAiTurn(
      baseInput({
        storage,
        ai: new FakeAI({
          text: "ok",
          totalTokens: 100,
          modelId: "m-free",
          costUsd: 0,
          priced: false,
        }),
      }),
    );
    expect(await storage.spend.listUnpriced()).toEqual(["m-free"]);
    expect((await storage.spend.getGlobal(1_000)).day).toBe(0);
  });

  test("a spend-booking failure is swallowed so the turn still returns", async () => {
    // Spend booking lives in its own namespace now, so instead of overriding a
    // method we hand the turn a storage whose `spend` is a real MemorySpendStore
    // with only `addGlobal` shadowed — every other domain (and the rest of
    // `spend`) still works, exactly as when a single write fails in production.
    const base = new MemoryStorage();
    const spend: SpendStore = Object.create(base.spend) as SpendStore;
    spend.addGlobal = () => {
      throw new Error("spend storage down");
    };
    const throwingSpendStorage: Storage = Object.assign(
      Object.create(base) as Storage,
      { spend },
    );
    const res = await runAiTurn(
      baseInput({
        storage: throwingSpendStorage,
        ai: new FakeAI({
          text: "still answered",
          totalTokens: 100,
          modelId: "m1",
          costUsd: 0.5,
          priced: true,
        }),
      }),
    );
    expect(res.text).toBe("still answered");
  });
});

describe("runAiTurn — effects passthrough & result", () => {
  test("collects effects a tool pushes onto the context and returns them", async () => {
    const ai = new FakeAI({ text: "done", totalTokens: 10 }, (opts) => {
      opts.toolCallContext.effects?.push({
        type: "reminder_scheduled",
        fireAtMs: 123_456,
        timezone: "UTC",
      });
    });
    const res = await runAiTurn(baseInput({ ai }));
    expect(res.effects).toEqual([
      { type: "reminder_scheduled", fireAtMs: 123_456, timezone: "UTC" },
    ]);
  });

  test("effects default to an empty array when no tool fires", async () => {
    const res = await runAiTurn(baseInput());
    expect(res.effects).toEqual([]);
  });

  test("returns text and totalTokens from the model result", async () => {
    const res = await runAiTurn(
      baseInput({ ai: new FakeAI({ text: "hello", totalTokens: 77 }) }),
    );
    expect(res.text).toBe("hello");
    expect(res.totalTokens).toBe(77);
  });
});

describe("runAiTurn — the run behind the turn", () => {
  test("carries the response ids and the answering model the client reported", async () => {
    const ai = new FakeAI({
      text: "answered",
      totalTokens: 10,
      generations: ["gen-1-aaa", "gen-2-bbb"],
      answeredBy: "anthropic/claude-sonnet-4.5",
    });
    const res = await runAiTurn(baseInput({ ai, detailLevel: "wise" }));
    expect(res.run.gen).toEqual(["gen-1-aaa", "gen-2-bbb"]);
    expect(res.run.model).toBe("anthropic/claude-sonnet-4.5");
    expect(res.run.detail).toBe("wise");
  });

  // Both are optional on `AskResult`, and a client that records neither must not
  // turn into a run claiming an empty model.
  test("a client that reports no ids and no model leaves gen empty and model absent", async () => {
    const res = await runAiTurn(
      baseInput({ ai: new FakeAI({ text: "answered", totalTokens: 10 }) }),
    );
    expect(res.run.gen).toEqual([]);
    expect("model" in res.run).toBe(false);
  });

  // Guest mode and reminder delivery pass none, and an explicit `undefined`
  // would still be a key on the stored node.
  test("no detail level means no detail key", async () => {
    const res = await runAiTurn(baseInput());
    expect("detail" in res.run).toBe(false);
  });

  // The hash has to fingerprint the prompt the model was actually handed, not a
  // second build of it.
  test("instr hashes the system prompt the model was sent", async () => {
    const ai = new FakeAI();
    const res = await runAiTurn(baseInput({ ai, detailLevel: "short" }));
    const sent = (ai.calls[0] as { system: string }).system;
    expect(res.run.instr).toBe(instructionHash(sent));
  });

  test("a changed persona changes instr", async () => {
    const first = await runAiTurn(baseInput({ systemPrompt: "Be helpful." }));
    const second = await runAiTurn(baseInput({ systemPrompt: "Be terse." }));
    expect(second.run.instr).not.toBe(first.run.instr);
  });
});
