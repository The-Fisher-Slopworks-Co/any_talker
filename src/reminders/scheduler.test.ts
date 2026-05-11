// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { GrammyError } from "grammy";
import { MemoryStorage } from "../storage/memory";
import { runReminderTick } from "./scheduler";
import type { ReminderApi } from "./delivery";
import type { Reminder } from "./types";

class FakeApi implements ReminderApi {
  calls: { chat_id: string | number }[] = [];
  constructor(private readonly impl: () => Promise<unknown>) {}
  async sendMessage(chat_id: string | number) {
    this.calls.push({ chat_id });
    return this.impl();
  }
}

const reminder = (over: Partial<Reminder> = {}): Reminder => ({
  id: "r1",
  userId: "u1",
  fireAtMs: 1_000,
  text: "ping",
  target: { kind: "ask_reply", chatId: "c1", replyToMessageId: 7 },
  createdAtMs: 0,
  ...over,
});

const grammyErr = (code: number) =>
  new GrammyError(
    `fail ${code}`,
    { ok: false, error_code: code, description: "fail" },
    "sendMessage",
    {},
  );

describe("runReminderTick", () => {
  test("delivers due reminders and removes them", async () => {
    const storage = new MemoryStorage();
    await storage.saveReminder(reminder({ id: "due", fireAtMs: 100 }));
    await storage.saveReminder(reminder({ id: "future", fireAtMs: 5_000 }));
    const api = new FakeApi(async () => ({}));

    await runReminderTick({ storage, api, nowMs: 1_000 });

    expect(api.calls).toHaveLength(1);
    const remaining = await storage.fetchDueReminders(10_000);
    expect(remaining.map((r) => r.id)).toEqual(["future"]);
  });

  test("transient failure keeps reminder for retry", async () => {
    const storage = new MemoryStorage();
    await storage.saveReminder(reminder({ id: "due", fireAtMs: 100 }));
    const api = new FakeApi(async () => {
      throw grammyErr(429);
    });

    await runReminderTick({ storage, api, nowMs: 1_000 });
    expect((await storage.fetchDueReminders(1_000)).map((r) => r.id)).toEqual([
      "due",
    ]);
  });

  test("permanent failure deletes reminder", async () => {
    const storage = new MemoryStorage();
    await storage.saveReminder(reminder({ id: "due", fireAtMs: 100 }));
    const api = new FakeApi(async () => {
      throw grammyErr(403);
    });

    await runReminderTick({ storage, api, nowMs: 1_000 });
    expect(await storage.fetchDueReminders(1_000)).toEqual([]);
  });

  test("no due reminders -> no api calls", async () => {
    const storage = new MemoryStorage();
    await storage.saveReminder(reminder({ id: "future", fireAtMs: 5_000 }));
    const api = new FakeApi(async () => ({}));

    await runReminderTick({ storage, api, nowMs: 1_000 });
    expect(api.calls).toEqual([]);
  });

  test("delivers multiple due reminders in one tick", async () => {
    const storage = new MemoryStorage();
    await storage.saveReminder(reminder({ id: "a", fireAtMs: 100 }));
    await storage.saveReminder(reminder({ id: "b", fireAtMs: 200 }));
    await storage.saveReminder(reminder({ id: "c", fireAtMs: 300 }));
    const api = new FakeApi(async () => ({}));

    await runReminderTick({ storage, api, nowMs: 1_000 });

    expect(api.calls).toHaveLength(3);
    expect(await storage.fetchDueReminders(10_000)).toEqual([]);
  });
});
