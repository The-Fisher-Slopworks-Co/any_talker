// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "../../../storage/memory";
import { createEditReminderTool } from "./edit";
import type { ToolEffect } from "../registry";
import {
  baseAskCtx as ctx,
  makeReminder as reminder,
} from "./tool-test-fixtures";

describe("edit_reminder", () => {
  test("schema requires at least one of text/newTime", () => {
    const storage = new MemoryStorage();
    const tool = createEditReminderTool({ storage });
    expect(tool.parameters.safeParse({ reminderId: "r1" }).success).toBe(false);
    expect(
      tool.parameters.safeParse({ reminderId: "r1", text: "new" }).success,
    ).toBe(true);
  });

  test("schema rejects an empty id", () => {
    const storage = new MemoryStorage();
    const tool = createEditReminderTool({ storage });
    expect(
      tool.parameters.safeParse({ reminderId: "", text: "new" }).success,
    ).toBe(false);
  });

  test("edits the note while keeping the fire time and original context", async () => {
    const storage = new MemoryStorage();
    await storage.saveReminder(
      reminder({
        id: "r1",
        fireAtMs: 2_000_000,
        text: "old note",
        createdAtMs: 500_000,
        contextMessages: [{ role: "user", content: "hi" }],
      }),
    );
    const tool = createEditReminderTool({ storage });
    const out = await tool.execute({ reminderId: "r1", text: "new note" }, ctx);
    expect(out).toEqual({ ok: true, fireAt: new Date(2_000_000).toISOString() });

    const saved = await storage.getReminder("r1");
    expect(saved?.text).toBe("new note");
    expect(saved?.fireAtMs).toBe(2_000_000);
    expect(saved?.createdAtMs).toBe(500_000);
    expect(saved?.contextMessages).toEqual([{ role: "user", content: "hi" }]);
  });

  test("reschedules with a relative duration ('in')", async () => {
    const storage = new MemoryStorage();
    await storage.saveReminder(reminder({ id: "r1", fireAtMs: 2_000_000 }));
    const tool = createEditReminderTool({ storage });
    // ctx.now is 1_000_000; +2 minutes = 1_120_000.
    const out = await tool.execute(
      { reminderId: "r1", newTime: { mode: "in", amount: 2, unit: "minutes" } },
      ctx,
    );
    expect(out).toEqual({ ok: true, fireAt: new Date(1_120_000).toISOString() });
    expect((await storage.getReminder("r1"))?.fireAtMs).toBe(1_120_000);
  });

  test("reschedules with an absolute datetime ('at')", async () => {
    const storage = new MemoryStorage();
    await storage.saveReminder(reminder({ id: "r1", fireAtMs: 2_000_000 }));
    const tool = createEditReminderTool({ storage });
    const out = await tool.execute(
      {
        reminderId: "r1",
        newTime: { mode: "at", datetime: "2030-01-01T09:00" },
      },
      { ...ctx, timezone: "UTC" },
    );
    const expectedMs = Date.UTC(2030, 0, 1, 9, 0);
    expect(out).toEqual({ ok: true, fireAt: new Date(expectedMs).toISOString() });
    expect((await storage.getReminder("r1"))?.fireAtMs).toBe(expectedMs);
  });

  test("changes both note and time in one call", async () => {
    const storage = new MemoryStorage();
    await storage.saveReminder(
      reminder({ id: "r1", fireAtMs: 2_000_000, text: "old" }),
    );
    const tool = createEditReminderTool({ storage });
    const out = await tool.execute(
      {
        reminderId: "r1",
        text: "new",
        newTime: { mode: "in", amount: 1, unit: "hours" },
      },
      ctx,
    );
    const expectedMs = 1_000_000 + 60 * 60_000;
    expect(out).toEqual({ ok: true, fireAt: new Date(expectedMs).toISOString() });
    const saved = await storage.getReminder("r1");
    expect(saved?.text).toBe("new");
    expect(saved?.fireAtMs).toBe(expectedMs);
  });

  test("pushes a reminder_updated effect with the new fire time", async () => {
    const storage = new MemoryStorage();
    await storage.saveReminder(reminder({ id: "r1", fireAtMs: 2_000_000 }));
    const effects: ToolEffect[] = [];
    const tool = createEditReminderTool({ storage });
    await tool.execute(
      { reminderId: "r1", newTime: { mode: "in", amount: 2, unit: "minutes" } },
      { ...ctx, timezone: "Europe/Moscow", effects },
    );
    expect(effects).toEqual([
      { type: "reminder_updated", fireAtMs: 1_120_000, timezone: "Europe/Moscow" },
    ]);
  });

  test("rejects a new time under the 1-minute lead and leaves the reminder unchanged", async () => {
    const storage = new MemoryStorage();
    await storage.saveReminder(reminder({ id: "r1", fireAtMs: 2_000_000 }));
    const effects: ToolEffect[] = [];
    const tool = createEditReminderTool({ storage });
    // ctx.now is 1_000_000 ms (1970-01-01T00:16 UTC); the epoch start is in the
    // past relative to it, so it's well under MIN_LEAD.
    const out = await tool.execute(
      { reminderId: "r1", newTime: { mode: "at", datetime: "1970-01-01T00:00" } },
      { ...ctx, timezone: "UTC", effects },
    );
    expect(out.ok).toBe(false);
    expect((await storage.getReminder("r1"))?.fireAtMs).toBe(2_000_000);
    expect(effects).toEqual([]);
  });

  test("a note-only edit is allowed even when the reminder is about to fire", async () => {
    const storage = new MemoryStorage();
    // fireAtMs is only 10s after now — below MIN_LEAD, but we're not moving it.
    await storage.saveReminder(reminder({ id: "r1", fireAtMs: 1_010_000 }));
    const tool = createEditReminderTool({ storage });
    const out = await tool.execute({ reminderId: "r1", text: "tweak" }, ctx);
    expect(out).toEqual({ ok: true, fireAt: new Date(1_010_000).toISOString() });
    expect((await storage.getReminder("r1"))?.text).toBe("tweak");
  });

  test("refuses to edit another user's reminder", async () => {
    const storage = new MemoryStorage();
    await storage.saveReminder(
      reminder({ id: "r1", userId: "u2", text: "theirs" }),
    );
    const effects: ToolEffect[] = [];
    const tool = createEditReminderTool({ storage });
    const out = await tool.execute(
      { reminderId: "r1", text: "hijack" },
      { ...ctx, effects },
    );
    expect(out.ok).toBe(false);
    expect((await storage.getReminder("r1"))?.text).toBe("theirs");
    expect(effects).toEqual([]);
  });

  test("unknown id -> ok:false, no effect", async () => {
    const storage = new MemoryStorage();
    const effects: ToolEffect[] = [];
    const tool = createEditReminderTool({ storage });
    const out = await tool.execute(
      { reminderId: "nope", text: "x" },
      { ...ctx, effects },
    );
    expect(out.ok).toBe(false);
    expect(effects).toEqual([]);
  });

  test("cannot edit a reminder from a different bot scope", async () => {
    const storage = new MemoryStorage();
    await storage.saveReminder(reminder({ id: "r1", text: "main-scope" }));
    const tool = createEditReminderTool({ storage });
    const out = await tool.execute(
      { reminderId: "r1", text: "x" },
      { ...ctx, botId: "bot9" },
    );
    expect(out.ok).toBe(false);
    expect((await storage.getReminder("r1"))?.text).toBe("main-scope");
  });
});
