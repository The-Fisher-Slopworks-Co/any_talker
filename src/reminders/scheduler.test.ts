// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { GrammyError } from "grammy";
import { MemoryStorage } from "../storage/memory";
import type { OnQuarantined } from "../storage/types/reminders";
import { runReminderTick, type ReminderRuntime } from "./scheduler";
import type { ReminderApi } from "./delivery";
import { t } from "../shared/i18n";
import { createMainPersonaResolver } from "../managed-bots/persona";
import type { Reminder } from "./types";
import type { AIClient, AIMessage, AskResult } from "../ai/types";
import type { Tool, ToolCallContext } from "../ai/tools/registry";

// Delivery now charges tokens to the limiter; these tests don't assert on that,
// so a no-op limiter satisfies the dep.
const testRateLimiter = {
  check: async () => ({ allowed: true as const }),
  deduct: async () => {},
  reset: async () => {},
};

type AskArgs = {
  models: string[];
  system: string;
  messages: AIMessage[];
  tools: Tool[];
  toolCallContext: ToolCallContext;
};

class FakeAI implements AIClient {
  calls = 0;
  constructor(
    private readonly impl: () => Promise<AskResult> = async () => ({
      text: "ok",
      totalTokens: 0,
    }),
  ) {}
  async ask(_opts: AskArgs): Promise<AskResult> {
    this.calls += 1;
    return this.impl();
  }
}

class FakeApi implements ReminderApi {
  calls: { chat_id: string | number; text: string }[] = [];
  // `impl` sees the outgoing text so a test can fail the reminder itself while
  // letting the failure notice that follows through.
  constructor(
    private readonly impl: (
      text: string,
    ) => Promise<unknown> = async () => ({}),
  ) {}
  async sendRichMessage(params: {
    chat_id: string | number;
    rich_message: { markdown: string };
  }) {
    this.calls.push({
      chat_id: params.chat_id,
      text: params.rich_message.markdown,
    });
    return this.impl(params.rich_message.markdown);
  }
  async sendMessage(chat_id: string | number, text: string) {
    this.calls.push({ chat_id, text });
    return this.impl(text);
  }
}

// The notice `reminder()` produces when its delivery is given up on.
const noticeFor = (note = "ping") => t("ru").reminders_delivery_failed(note);

const reminder = (over: Partial<Reminder> = {}): Reminder => ({
  id: "r1",
  userId: "u1",
  chatId: "c1",
  lang: "ru",
  fireAtMs: 1_000,
  text: "ping",
  target: { kind: "ask_reply", chatId: "c1", replyToMessageId: 7 },
  createdAtMs: 0,
  contextMessages: [],
  ...over,
});

const grammyErr = (code: number) =>
  new GrammyError(
    `fail ${code}`,
    { ok: false, error_code: code, description: "fail" },
    "sendMessage",
    {},
  );

// MemoryStorage holds parsed objects and can never quarantine, so the
// storage→notice path is driven through a `fetchDue` that reports the given
// raw payloads the way KeyDB's does after quarantining them.
function quarantiningStorage(raws: Record<string, string>): MemoryStorage {
  const storage = new MemoryStorage();
  const fetchDue = storage.reminders.fetchDue.bind(storage.reminders);
  storage.reminders.fetchDue = async (
    nowMs: number,
    onQuarantined?: OnQuarantined,
  ) => {
    for (const [id, raw] of Object.entries(raws)) {
      await onQuarantined?.({
        id,
        raw,
        reason: "schema_violation",
        quarantinedAtMs: nowMs,
      });
    }
    return fetchDue(nowMs);
  };
  return storage;
}

// One main-bot reminder runtime (null scope) over the given storage + api.
const runtimes = (
  storage: MemoryStorage,
  api: ReminderApi,
): ReminderRuntime[] => [
  { botId: null, storage, api, resolver: createMainPersonaResolver(storage) },
];

describe("runReminderTick", () => {
  test("delivers due reminders and removes them", async () => {
    const storage = new MemoryStorage();
    await storage.reminders.save(reminder({ id: "due", fireAtMs: 100 }));
    await storage.reminders.save(reminder({ id: "future", fireAtMs: 5_000 }));
    const api = new FakeApi();
    const ai = new FakeAI();

    await runReminderTick({
      runtimes: runtimes(storage, api),
      ai,
      rateLimiter: testRateLimiter,
      ownerId: "owner",
      nowMs: 1_000,
    });

    expect(api.calls).toHaveLength(1);
    expect(ai.calls).toBe(1);
    const remaining = await storage.reminders.fetchDue(10_000);
    expect(remaining.map((r) => r.id)).toEqual(["future"]);
  });

  test("transient TG failure keeps reminder for retry", async () => {
    const storage = new MemoryStorage();
    await storage.reminders.save(reminder({ id: "due", fireAtMs: 100 }));
    const api = new FakeApi(async () => {
      throw grammyErr(429);
    });
    const ai = new FakeAI();

    await runReminderTick({
      runtimes: runtimes(storage, api),
      ai,
      rateLimiter: testRateLimiter,
      ownerId: "owner",
      nowMs: 1_000,
    });
    expect((await storage.reminders.fetchDue(1_000)).map((r) => r.id)).toEqual([
      "due",
    ]);
  });

  test("transient AI failure keeps reminder for retry and does not call TG", async () => {
    const storage = new MemoryStorage();
    await storage.reminders.save(reminder({ id: "due", fireAtMs: 100 }));
    const api = new FakeApi();
    const ai = new FakeAI(async () => {
      throw new Error("ai down");
    });

    await runReminderTick({
      runtimes: runtimes(storage, api),
      ai,
      rateLimiter: testRateLimiter,
      ownerId: "owner",
      nowMs: 1_000,
    });
    expect(api.calls).toEqual([]);
    expect((await storage.reminders.fetchDue(1_000)).map((r) => r.id)).toEqual([
      "due",
    ]);
  });

  test("permanent TG failure deletes reminder and tells the user", async () => {
    const storage = new MemoryStorage();
    await storage.reminders.save(reminder({ id: "due", fireAtMs: 100 }));
    // A 400 that is about the message, not the chat: the reminder is lost but
    // the chat is still reachable, so the notice must arrive.
    const api = new FakeApi(async (text) => {
      if (text === noticeFor()) return {};
      throw grammyErr(400);
    });
    const ai = new FakeAI();

    await runReminderTick({
      runtimes: runtimes(storage, api),
      ai,
      rateLimiter: testRateLimiter,
      ownerId: "owner",
      nowMs: 1_000,
    });
    expect(await storage.reminders.fetchDue(1_000)).toEqual([]);
    expect(api.calls.at(-1)).toEqual({ chat_id: "c1", text: noticeFor() });
  });

  test("unreachable chat deletes reminder without a notice", async () => {
    const storage = new MemoryStorage();
    await storage.reminders.save(reminder({ id: "due", fireAtMs: 100 }));
    // 403 means the bot may not write here at all; a notice would only earn a
    // second identical error.
    const api = new FakeApi(async (text) => {
      if (text === noticeFor()) return {};
      throw grammyErr(403);
    });
    const ai = new FakeAI();

    await runReminderTick({
      runtimes: runtimes(storage, api),
      ai,
      rateLimiter: testRateLimiter,
      ownerId: "owner",
      nowMs: 1_000,
    });
    expect(await storage.reminders.fetchDue(1_000)).toEqual([]);
    expect(api.calls.map((c) => c.text)).not.toContain(noticeFor());
  });

  test("transient failure sends no notice — the retry may still succeed", async () => {
    const storage = new MemoryStorage();
    await storage.reminders.save(reminder({ id: "due", fireAtMs: 100 }));
    const api = new FakeApi(async (text) => {
      if (text === noticeFor()) return {};
      throw grammyErr(429);
    });
    const ai = new FakeAI();

    await runReminderTick({
      runtimes: runtimes(storage, api),
      ai,
      rateLimiter: testRateLimiter,
      ownerId: "owner",
      nowMs: 1_000,
    });
    expect(api.calls.map((c) => c.text)).not.toContain(noticeFor());
  });

  test("quarantined record: the user is told, in their language, with the note", async () => {
    const storage = quarantiningStorage({
      q1: JSON.stringify({
        id: "q1",
        userId: "u1",
        lang: "ru",
        text: "ping",
        target: { kind: "ask_reply", chatId: "c1", replyToMessageId: 7 },
        contextMessages: "garbage",
      }),
    });
    const api = new FakeApi();
    const ai = new FakeAI();

    await runReminderTick({
      runtimes: runtimes(storage, api),
      ai,
      rateLimiter: testRateLimiter,
      ownerId: "owner",
      nowMs: 1_000,
    });

    // No LLM re-run for a record that cannot be delivered anyway.
    expect(ai.calls).toBe(0);
    expect(api.calls).toEqual([{ chat_id: "c1", text: noticeFor() }]);
  });

  test("quarantined record without a readable note still gets a notice", async () => {
    const storage = quarantiningStorage({
      q1: JSON.stringify({
        userId: "u1",
        target: { kind: "guest_dm", userId: "u1" },
      }),
    });
    const api = new FakeApi();

    await runReminderTick({
      runtimes: runtimes(storage, api),
      ai: new FakeAI(),
      rateLimiter: testRateLimiter,
      ownerId: "owner",
      nowMs: 1_000,
    });

    expect(api.calls).toEqual([
      { chat_id: "u1", text: t("en").reminders_delivery_failed_no_note },
    ]);
  });

  test("quarantined record with no recipient is dropped silently", async () => {
    const storage = quarantiningStorage({ q1: "{not json" });
    const api = new FakeApi();

    await runReminderTick({
      runtimes: runtimes(storage, api),
      ai: new FakeAI(),
      rateLimiter: testRateLimiter,
      ownerId: "owner",
      nowMs: 1_000,
    });

    expect(api.calls).toEqual([]);
  });

  test("no due reminders -> no api calls", async () => {
    const storage = new MemoryStorage();
    await storage.reminders.save(reminder({ id: "future", fireAtMs: 5_000 }));
    const api = new FakeApi();
    const ai = new FakeAI();

    await runReminderTick({
      runtimes: runtimes(storage, api),
      ai,
      rateLimiter: testRateLimiter,
      ownerId: "owner",
      nowMs: 1_000,
    });
    expect(api.calls).toEqual([]);
    expect(ai.calls).toBe(0);
  });

  test("blacklisted user's reminder is dropped without AI or TG calls", async () => {
    const storage = new MemoryStorage();
    await storage.reminders.save(reminder({ id: "due", fireAtMs: 100 }));
    await storage.access.addBlacklist("users", { id: "u1" });
    const api = new FakeApi();
    const ai = new FakeAI();

    await runReminderTick({
      runtimes: runtimes(storage, api),
      ai,
      rateLimiter: testRateLimiter,
      ownerId: "owner",
      nowMs: 1_000,
    });

    expect(api.calls).toEqual([]);
    expect(ai.calls).toBe(0);
    expect(await storage.reminders.fetchDue(10_000)).toEqual([]);
  });

  test("blacklisted chat's reminder is dropped without AI or TG calls", async () => {
    const storage = new MemoryStorage();
    await storage.reminders.save(reminder({ id: "due", fireAtMs: 100 }));
    await storage.access.addBlacklist("chats", { id: "c1" });
    const api = new FakeApi();
    const ai = new FakeAI();

    await runReminderTick({
      runtimes: runtimes(storage, api),
      ai,
      rateLimiter: testRateLimiter,
      ownerId: "owner",
      nowMs: 1_000,
    });

    expect(api.calls).toEqual([]);
    expect(ai.calls).toBe(0);
    expect(await storage.reminders.fetchDue(10_000)).toEqual([]);
  });

  test("delivers multiple due reminders in one tick", async () => {
    const storage = new MemoryStorage();
    await storage.reminders.save(reminder({ id: "a", fireAtMs: 100 }));
    await storage.reminders.save(reminder({ id: "b", fireAtMs: 200 }));
    await storage.reminders.save(reminder({ id: "c", fireAtMs: 300 }));
    const api = new FakeApi();
    const ai = new FakeAI();

    await runReminderTick({
      runtimes: runtimes(storage, api),
      ai,
      rateLimiter: testRateLimiter,
      ownerId: "owner",
      nowMs: 1_000,
    });

    expect(api.calls).toHaveLength(3);
    expect(ai.calls).toBe(3);
    expect(await storage.reminders.fetchDue(10_000)).toEqual([]);
  });
});

describe("runReminderTick: recurring reminders", () => {
  const every10min = { kind: "interval", everyMs: 10 * 60_000 } as const;

  // Drives one tick at `nowMs` over the given storage; returns the api so a
  // caller can count deliveries.
  const tick = async (storage: MemoryStorage, api: FakeApi, nowMs: number) =>
    runReminderTick({
      runtimes: runtimes(storage, api),
      ai: new FakeAI(),
      rateLimiter: testRateLimiter,
      ownerId: "owner",
      nowMs,
    });

  test("a delivered occurrence re-schedules instead of deleting", async () => {
    const storage = new MemoryStorage();
    await storage.reminders.save(
      reminder({
        id: "rec",
        fireAtMs: 1_000,
        recurrence: {
          spec: every10min,
          occurrencesLeft: 4,
          occurrencesTotal: 4,
        },
      }),
    );
    const api = new FakeApi();

    await tick(storage, api, 1_000);

    expect(api.calls).toHaveLength(1);
    const stored = await storage.reminders.get("rec");
    expect(stored).toMatchObject({
      fireAtMs: 1_000 + 10 * 60_000,
      recurrence: { occurrencesLeft: 3, occurrencesTotal: 4 },
    });
  });

  test("fires exactly the allowed number of times, then is removed", async () => {
    const storage = new MemoryStorage();
    await storage.reminders.save(
      reminder({
        id: "rec",
        fireAtMs: 1_000,
        recurrence: {
          spec: every10min,
          occurrencesLeft: 4,
          occurrencesTotal: 4,
        },
      }),
    );
    const api = new FakeApi();

    // One tick per occurrence, each at the moment that occurrence is due.
    for (let i = 0; i < 6; i++) {
      await tick(storage, api, 1_000 + i * 10 * 60_000);
    }

    expect(api.calls).toHaveLength(4);
    expect(await storage.reminders.get("rec")).toBeNull();
  });

  test("occupies one slot of the per-user cap while it runs", async () => {
    const storage = new MemoryStorage();
    await storage.reminders.save(
      reminder({
        id: "rec",
        fireAtMs: 1_000,
        recurrence: {
          spec: every10min,
          occurrencesLeft: 4,
          occurrencesTotal: 4,
        },
      }),
    );
    const api = new FakeApi();

    await tick(storage, api, 1_000);

    // Same id, same user index entry: the series never grows into a second
    // reminder as it advances.
    expect(
      (await storage.reminders.listForUser("u1")).map((r) => r.id),
    ).toEqual(["rec"]);
  });

  test("a permanent delivery failure ends the series", async () => {
    const storage = new MemoryStorage();
    await storage.reminders.save(
      reminder({
        id: "rec",
        fireAtMs: 1_000,
        recurrence: {
          spec: every10min,
          occurrencesLeft: 4,
          occurrencesTotal: 4,
        },
      }),
    );
    // Fail the reminder itself but let the failure notice through, as the
    // one-shot tests do.
    const api = new FakeApi(async (text) => {
      if (text === noticeFor()) return {};
      throw grammyErr(400);
    });

    await tick(storage, api, 1_000);

    expect(await storage.reminders.get("rec")).toBeNull();
  });

  test("a transient failure retries the same occurrence", async () => {
    const storage = new MemoryStorage();
    await storage.reminders.save(
      reminder({
        id: "rec",
        fireAtMs: 1_000,
        recurrence: {
          spec: every10min,
          occurrencesLeft: 4,
          occurrencesTotal: 4,
        },
      }),
    );
    const api = new FakeApi(async () => {
      throw grammyErr(500);
    });

    await tick(storage, api, 1_000);

    expect(await storage.reminders.get("rec")).toMatchObject({
      fireAtMs: 1_000,
      recurrence: { occurrencesLeft: 4 },
    });
  });
});
