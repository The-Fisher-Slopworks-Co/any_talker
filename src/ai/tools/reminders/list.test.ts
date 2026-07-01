// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "../../../storage/memory";
import { createListRemindersTool } from "./list";
import {
  baseAskCtx as ctx,
  makeReminder as reminder,
} from "./tool-test-fixtures";

describe("list_reminders", () => {
  test("empty -> no reminders, total 0, not truncated", async () => {
    const storage = new MemoryStorage();
    const tool = createListRemindersTool({ storage });
    const out = await tool.execute({}, ctx);
    expect(out).toEqual({ reminders: [], total: 0, truncated: false });
  });

  test("returns the user's reminders soonest first with id/fireAt/note", async () => {
    const storage = new MemoryStorage();
    await storage.saveReminder(
      reminder({ id: "late", fireAtMs: 3_000_000, text: "later" }),
    );
    await storage.saveReminder(
      reminder({ id: "soon", fireAtMs: 2_000_000, text: "sooner" }),
    );
    const tool = createListRemindersTool({ storage });
    const out = await tool.execute({}, ctx);
    expect(out.total).toBe(2);
    expect(out.truncated).toBe(false);
    expect(out.reminders.map((r) => r.id)).toEqual(["soon", "late"]);
    expect(out.reminders[0]).toEqual({
      id: "soon",
      fireAt: new Date(2_000_000).toISOString(),
      note: "sooner",
    });
  });

  test("only the calling user's reminders are returned", async () => {
    const storage = new MemoryStorage();
    await storage.saveReminder(reminder({ id: "mine", userId: "u1" }));
    await storage.saveReminder(reminder({ id: "theirs", userId: "u2" }));
    const tool = createListRemindersTool({ storage });
    const out = await tool.execute({}, ctx);
    expect(out.reminders.map((r) => r.id)).toEqual(["mine"]);
  });

  test("only reminders from the current chat are returned", async () => {
    const storage = new MemoryStorage();
    // Same user, two different chats; the tool runs in chat "c1" (baseAskCtx).
    await storage.saveReminder(reminder({ id: "here", chatId: "c1" }));
    await storage.saveReminder(reminder({ id: "elsewhere", chatId: "c2" }));
    const tool = createListRemindersTool({ storage });
    const out = await tool.execute({}, ctx);
    expect(out.reminders.map((r) => r.id)).toEqual(["here"]);
    // total/truncated reflect the chat-scoped set, not the user's whole list.
    expect(out.total).toBe(1);
    expect(out.truncated).toBe(false);
  });

  test("in the user's private DM, all of their reminders are returned", async () => {
    const storage = new MemoryStorage();
    // A private DM is the one chat whose id equals the user's id. There the
    // user manages their whole list, including reminders created elsewhere
    // (e.g. a guest-DM reminder delivered here but recorded against another
    // chat, or one whose chat id changed under it). Distinct fire times keep
    // the soonest-first assertion deterministic.
    await storage.saveReminder(
      reminder({ id: "here", chatId: "u1", fireAtMs: 2_000_000 }),
    );
    await storage.saveReminder(
      reminder({ id: "elsewhere", chatId: "c2", fireAtMs: 3_000_000 }),
    );
    const tool = createListRemindersTool({ storage });
    // Run in the DM: chatId === userId ("u1").
    const out = await tool.execute({}, { ...ctx, chatId: "u1" });
    expect(out.reminders.map((r) => r.id)).toEqual(["here", "elsewhere"]);
    expect(out.total).toBe(2);
    expect(out.truncated).toBe(false);
  });

  test("truncates a long note to a bounded preview ending with an ellipsis", async () => {
    const storage = new MemoryStorage();
    await storage.saveReminder(reminder({ text: "x".repeat(500) }));
    const tool = createListRemindersTool({ storage });
    const out = await tool.execute({}, ctx);
    const note = out.reminders[0]!.note;
    expect(note.length).toBe(120);
    expect(note.endsWith("…")).toBe(true);
  });

  test("truncates a note of emoji without producing a lone surrogate", async () => {
    const storage = new MemoryStorage();
    await storage.saveReminder(reminder({ text: "😀".repeat(200) }));
    const tool = createListRemindersTool({ storage });
    const out = await tool.execute({}, ctx);
    const note = out.reminders[0]!.note;
    expect(note.endsWith("😀…")).toBe(true);
    // No lone surrogate survives the cut.
    const loneSurrogate = [...note].some(
      (c) =>
        c.length === 1 && c.charCodeAt(0) >= 0xd800 && c.charCodeAt(0) <= 0xdfff,
    );
    expect(loneSurrogate).toBe(false);
  });

  test("caps the result and flags truncation when over the limit", async () => {
    const storage = new MemoryStorage();
    for (let i = 0; i < 60; i++) {
      await storage.saveReminder(
        reminder({ id: `r${i}`, fireAtMs: 2_000_000 + i }),
      );
    }
    const tool = createListRemindersTool({ storage });
    const out = await tool.execute({}, ctx);
    expect(out.total).toBe(60);
    expect(out.reminders).toHaveLength(50);
    expect(out.truncated).toBe(true);
    // The soonest are kept.
    expect(out.reminders[0]!.id).toBe("r0");
  });

  test("a managed bot only sees its own scoped reminders", async () => {
    const storage = new MemoryStorage();
    // Reminder created under the main bot namespace.
    await storage.saveReminder(reminder({ id: "main" }));
    const tool = createListRemindersTool({ storage });
    const out = await tool.execute({}, { ...ctx, botId: "bot9" });
    expect(out.reminders).toEqual([]);
  });
});
