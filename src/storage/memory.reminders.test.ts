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
  contextMessages: [],
  ...over,
});

describe("MemoryStorage reminders", () => {
  test("save then fetch due returns reminder when fireAt <= now", async () => {
    const s = new MemoryStorage();
    await s.reminders.save(reminder({ id: "r1", fireAtMs: 100 }));
    expect(await s.reminders.fetchDue(99)).toEqual([]);
    expect(await s.reminders.fetchDue(100)).toEqual([
      reminder({ id: "r1", fireAtMs: 100 }),
    ]);
  });

  test("reminders.fetchDue sorts by fireAtMs ascending", async () => {
    const s = new MemoryStorage();
    await s.reminders.save(reminder({ id: "late", fireAtMs: 200 }));
    await s.reminders.save(reminder({ id: "early", fireAtMs: 100 }));
    const due = await s.reminders.fetchDue(300);
    expect(due.map((r) => r.id)).toEqual(["early", "late"]);
  });

  test("reminders.delete removes from listing", async () => {
    const s = new MemoryStorage();
    await s.reminders.save(reminder({ id: "r1", userId: "u1", fireAtMs: 100 }));
    await s.reminders.delete("r1", "u1");
    expect(await s.reminders.fetchDue(1_000)).toEqual([]);
  });

  test("guest_dm target round-trips", async () => {
    const s = new MemoryStorage();
    const r = reminder({
      id: "g",
      target: { kind: "guest_dm", userId: "u42" },
    });
    await s.reminders.save(r);
    expect(await s.reminders.fetchDue(r.fireAtMs)).toEqual([r]);
  });

  test("save returns deep-cloned values (no aliasing)", async () => {
    const s = new MemoryStorage();
    const r = reminder({ id: "x" });
    await s.reminders.save(r);
    r.text = "mutated";
    const out = (await s.reminders.fetchDue(10_000))[0];
    expect(out?.text).toBe("ping");
  });

  test("reminders.listForUser filters by userId, sorted by fireAt asc", async () => {
    const s = new MemoryStorage();
    await s.reminders.save(reminder({ id: "a", userId: "u1", fireAtMs: 200 }));
    await s.reminders.save(reminder({ id: "b", userId: "u2", fireAtMs: 100 }));
    await s.reminders.save(reminder({ id: "c", userId: "u1", fireAtMs: 100 }));
    expect((await s.reminders.listForUser("u1")).map((r) => r.id)).toEqual([
      "c",
      "a",
    ]);
    expect((await s.reminders.listForUser("u2")).map((r) => r.id)).toEqual([
      "b",
    ]);
    expect(await s.reminders.listForUser("u3")).toEqual([]);
  });

  test("reminders.listAll returns every saved reminder, sorted by fireAt asc", async () => {
    const s = new MemoryStorage();
    await s.reminders.save(reminder({ id: "a", userId: "u1", fireAtMs: 200 }));
    await s.reminders.save(reminder({ id: "b", userId: "u2", fireAtMs: 100 }));
    expect((await s.reminders.listAll()).map((r) => r.id)).toEqual(["b", "a"]);
  });

  test("reminders.get returns a clone of the saved reminder, or null", async () => {
    const s = new MemoryStorage();
    await s.reminders.save(reminder({ id: "r1", text: "ping" }));
    const got = await s.reminders.get("r1");
    expect(got).toEqual(reminder({ id: "r1", text: "ping" }));
    // Mutating the returned object does not corrupt storage.
    got!.text = "mutated";
    expect((await s.reminders.get("r1"))!.text).toBe("ping");
    expect(await s.reminders.get("missing")).toBeNull();
  });

  test("reminders.saveIfUnderCap counts only that user's reminders", async () => {
    const s = new MemoryStorage();
    await s.reminders.save(reminder({ id: "a", userId: "u1" }));
    await s.reminders.save(reminder({ id: "b", userId: "u1" }));
    expect(
      await s.reminders.saveIfUnderCap(reminder({ id: "c", userId: "u1" }), 2, [
        null,
      ]),
    ).toEqual({ ok: false, reason: "limit_reached" });
    // u2 has their own allowance, and the rejected reminder was not stored.
    expect(
      await s.reminders.saveIfUnderCap(reminder({ id: "d", userId: "u2" }), 2, [
        null,
      ]),
    ).toEqual({ ok: true });
    expect(await s.reminders.get("c")).toBeNull();
    expect(await s.reminders.get("d")).not.toBeNull();
    // Freeing a slot lets the next one through.
    await s.reminders.delete("a", "u1");
    expect(
      await s.reminders.saveIfUnderCap(reminder({ id: "c", userId: "u1" }), 2, [
        null,
      ]),
    ).toEqual({ ok: true });
  });

  test("reminders.saveIfUnderCap counts every scope it is given, once each", async () => {
    const s = new MemoryStorage();
    await s.forBot("bot9").reminders.save(reminder({ id: "a", userId: "u1" }));
    // The main bot's scope is empty, but bot9's reminder fills the family cap.
    expect(
      await s.reminders.saveIfUnderCap(reminder({ id: "b", userId: "u1" }), 1, [
        null,
        "bot9",
      ]),
    ).toEqual({ ok: false, reason: "limit_reached" });
    // A repeated scope is not double-counted: one reminder against a cap of 2.
    expect(
      await s
        .forBot("bot9")
        .reminders.saveIfUnderCap(reminder({ id: "c", userId: "u1" }), 2, [
          "bot9",
          "bot9",
          null,
        ]),
    ).toEqual({ ok: true });
  });
});

describe("MemoryStorage private chat flag", () => {
  test("starts unset", async () => {
    const s = new MemoryStorage();
    expect(await s.privateChats.has("u1")).toBe(false);
  });

  test("record then check", async () => {
    const s = new MemoryStorage();
    await s.privateChats.record("u1");
    expect(await s.privateChats.has("u1")).toBe(true);
    expect(await s.privateChats.has("u2")).toBe(false);
  });

  test("record is idempotent", async () => {
    const s = new MemoryStorage();
    await s.privateChats.record("u1");
    await s.privateChats.record("u1");
    expect(await s.privateChats.has("u1")).toBe(true);
  });
});
