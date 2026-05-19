// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "./memory";
import type { Reminder } from "../reminders/types";

const reminder = (over: Partial<Reminder> = {}): Reminder => ({
  id: "r1",
  userId: "u1",
  chatId: "c1",
  lang: "en",
  fireAtMs: 1_000,
  text: "ping",
  target: { kind: "ask_reply", chatId: "c1", replyToMessageId: 7 },
  createdAtMs: 500,
  ...over,
});

describe("MemoryStorage reminders", () => {
  test("save then fetch due returns reminder when fireAt <= now", async () => {
    const s = new MemoryStorage();
    await s.saveReminder(reminder({ id: "r1", fireAtMs: 100 }));
    expect(await s.fetchDueReminders(99)).toEqual([]);
    expect(await s.fetchDueReminders(100)).toEqual([
      reminder({ id: "r1", fireAtMs: 100 }),
    ]);
  });

  test("fetchDueReminders sorts by fireAtMs ascending", async () => {
    const s = new MemoryStorage();
    await s.saveReminder(reminder({ id: "late", fireAtMs: 200 }));
    await s.saveReminder(reminder({ id: "early", fireAtMs: 100 }));
    const due = await s.fetchDueReminders(300);
    expect(due.map((r) => r.id)).toEqual(["early", "late"]);
  });

  test("deleteReminder removes from listing", async () => {
    const s = new MemoryStorage();
    await s.saveReminder(reminder({ id: "r1", userId: "u1", fireAtMs: 100 }));
    await s.deleteReminder("r1", "u1");
    expect(await s.fetchDueReminders(1_000)).toEqual([]);
  });

  test("guest_dm target round-trips", async () => {
    const s = new MemoryStorage();
    const r = reminder({
      id: "g",
      target: { kind: "guest_dm", userId: "u42" },
    });
    await s.saveReminder(r);
    expect(await s.fetchDueReminders(r.fireAtMs)).toEqual([r]);
  });

  test("save returns deep-cloned values (no aliasing)", async () => {
    const s = new MemoryStorage();
    const r = reminder({ id: "x" });
    await s.saveReminder(r);
    r.text = "mutated";
    const out = (await s.fetchDueReminders(10_000))[0];
    expect(out?.text).toBe("ping");
  });

  test("listRemindersForUser filters by userId, sorted by fireAt asc", async () => {
    const s = new MemoryStorage();
    await s.saveReminder(reminder({ id: "a", userId: "u1", fireAtMs: 200 }));
    await s.saveReminder(reminder({ id: "b", userId: "u2", fireAtMs: 100 }));
    await s.saveReminder(reminder({ id: "c", userId: "u1", fireAtMs: 100 }));
    expect((await s.listRemindersForUser("u1")).map((r) => r.id)).toEqual([
      "c",
      "a",
    ]);
    expect((await s.listRemindersForUser("u2")).map((r) => r.id)).toEqual([
      "b",
    ]);
    expect(await s.listRemindersForUser("u3")).toEqual([]);
  });

  test("listAllReminders returns every saved reminder, sorted by fireAt asc", async () => {
    const s = new MemoryStorage();
    await s.saveReminder(reminder({ id: "a", userId: "u1", fireAtMs: 200 }));
    await s.saveReminder(reminder({ id: "b", userId: "u2", fireAtMs: 100 }));
    expect((await s.listAllReminders()).map((r) => r.id)).toEqual(["b", "a"]);
  });
});

describe("MemoryStorage private chat flag", () => {
  test("starts unset", async () => {
    const s = new MemoryStorage();
    expect(await s.userHasPrivateChat("u1")).toBe(false);
  });

  test("record then check", async () => {
    const s = new MemoryStorage();
    await s.recordPrivateChat("u1");
    expect(await s.userHasPrivateChat("u1")).toBe(true);
    expect(await s.userHasPrivateChat("u2")).toBe(false);
  });

  test("record is idempotent", async () => {
    const s = new MemoryStorage();
    await s.recordPrivateChat("u1");
    await s.recordPrivateChat("u1");
    expect(await s.userHasPrivateChat("u1")).toBe(true);
  });
});
