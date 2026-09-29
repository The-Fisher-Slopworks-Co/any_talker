// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "../../../storage/memory";
import { createEditReminderTool } from "./edit";
import { createListRemindersTool } from "./list";
import type { ToolEffect } from "../registry";
import {
  baseAskCtx as ctx,
  makeReminder as reminder,
} from "./tool-test-fixtures";

describe("edit_reminder", () => {
  test("schema requires at least one of text/new time", () => {
    const storage = new MemoryStorage();
    const tool = createEditReminderTool({ storage });
    expect(tool.parameters.safeParse({ reminderId: "r1" }).success).toBe(false);
    expect(
      tool.parameters.safeParse({ reminderId: "r1", text: "new" }).success,
    ).toBe(true);
  });

  // #204: the old nested `newTime` object kept arriving as a JSON string and
  // failed validation; the new time is now flat top-level fields.
  test("schema takes the new time as flat top-level fields", () => {
    const tool = createEditReminderTool({ storage: new MemoryStorage() });
    const ok = (v: object) =>
      tool.parameters.safeParse({ reminderId: "r1", ...v }).success;
    expect(ok({ inAmount: 2, inUnit: "hours" })).toBe(true);
    expect(ok({ atDatetime: "2030-01-01T09:00" })).toBe(true);
    // Half a relative time, or both ways at once, is ambiguous.
    expect(ok({ inAmount: 2 })).toBe(false);
    expect(ok({ inUnit: "hours" })).toBe(false);
    expect(
      ok({ inAmount: 2, inUnit: "hours", atDatetime: "2030-01-01T09:00" }),
    ).toBe(false);
  });

  test("description tells the model a refusal changed nothing", () => {
    const tool = createEditReminderTool({ storage: new MemoryStorage() });
    expect(tool.description).toContain("ok: false, NOTHING was changed");
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
    await storage.reminders.save(
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
    expect(out).toEqual({
      ok: true,
      fireAt: "1970-01-01T00:33",
    });

    const saved = await storage.reminders.get("r1");
    expect(saved?.text).toBe("new note");
    expect(saved?.fireAtMs).toBe(2_000_000);
    expect(saved?.createdAtMs).toBe(500_000);
    expect(saved?.contextMessages).toEqual([{ role: "user", content: "hi" }]);
  });

  test("reschedules with a relative duration ('in')", async () => {
    const storage = new MemoryStorage();
    await storage.reminders.save(reminder({ id: "r1", fireAtMs: 2_000_000 }));
    const tool = createEditReminderTool({ storage });
    // ctx.now is 1_000_000; +2 minutes = 1_120_000.
    const out = await tool.execute(
      { reminderId: "r1", inAmount: 2, inUnit: "minutes" },
      ctx,
    );
    expect(out).toEqual({
      ok: true,
      fireAt: "1970-01-01T00:18",
    });
    expect((await storage.reminders.get("r1"))?.fireAtMs).toBe(1_120_000);
  });

  test("reschedules with an absolute datetime ('at')", async () => {
    const storage = new MemoryStorage();
    await storage.reminders.save(reminder({ id: "r1", fireAtMs: 2_000_000 }));
    const tool = createEditReminderTool({ storage });
    const out = await tool.execute(
      {
        reminderId: "r1",
        atDatetime: "2030-01-01T09:00",
      },
      { ...ctx, timezone: "UTC" },
    );
    const expectedMs = Date.UTC(2030, 0, 1, 9, 0);
    expect(out).toEqual({ ok: true, fireAt: "2030-01-01T09:00" });
    expect((await storage.reminders.get("r1"))?.fireAtMs).toBe(expectedMs);
  });

  test("changes both note and time in one call", async () => {
    const storage = new MemoryStorage();
    await storage.reminders.save(
      reminder({ id: "r1", fireAtMs: 2_000_000, text: "old" }),
    );
    const tool = createEditReminderTool({ storage });
    const out = await tool.execute(
      {
        reminderId: "r1",
        text: "new",
        inAmount: 1,
        inUnit: "hours",
      },
      ctx,
    );
    const expectedMs = 1_000_000 + 60 * 60_000;
    expect(out).toEqual({ ok: true, fireAt: "1970-01-01T01:16" });
    const saved = await storage.reminders.get("r1");
    expect(saved?.text).toBe("new");
    expect(saved?.fireAtMs).toBe(expectedMs);
  });

  test("pushes a reminder_updated effect with the new fire time", async () => {
    const storage = new MemoryStorage();
    await storage.reminders.save(reminder({ id: "r1", fireAtMs: 2_000_000 }));
    const effects: ToolEffect[] = [];
    const tool = createEditReminderTool({ storage });
    await tool.execute(
      { reminderId: "r1", inAmount: 2, inUnit: "minutes" },
      { ...ctx, timezone: "Europe/Moscow", effects },
    );
    expect(effects).toEqual([
      {
        type: "reminder_updated",
        fireAtMs: 1_120_000,
        timezone: "Europe/Moscow",
      },
    ]);
  });

  test("rejects a new time under the 1-minute lead and leaves the reminder unchanged", async () => {
    const storage = new MemoryStorage();
    await storage.reminders.save(reminder({ id: "r1", fireAtMs: 2_000_000 }));
    const effects: ToolEffect[] = [];
    const tool = createEditReminderTool({ storage });
    // ctx.now is 1_000_000 ms (1970-01-01T00:16 UTC); the epoch start is in the
    // past relative to it, so it's well under MIN_LEAD.
    const out = await tool.execute(
      {
        reminderId: "r1",
        atDatetime: "1970-01-01T00:00",
      },
      { ...ctx, timezone: "UTC", effects },
    );
    expect(out.ok).toBe(false);
    expect((await storage.reminders.get("r1"))?.fireAtMs).toBe(2_000_000);
    expect(effects).toEqual([]);
  });

  // #204: a bare "at least 1 minute from now" left the model unable to see
  // (or tell the user) what went wrong.
  test("a too-soon refusal names the resolved and current local times", async () => {
    const storage = new MemoryStorage();
    await storage.reminders.save(reminder({ id: "r1", fireAtMs: 2_000_000 }));
    const tool = createEditReminderTool({ storage });
    const now = Date.UTC(2026, 8, 29, 15, 30);
    // 18:00 in Moscow is 15:00 UTC — half an hour ago.
    const out = await tool.execute(
      { reminderId: "r1", atDatetime: "2026-09-29T18:00" },
      { ...ctx, now, timezone: "Europe/Moscow" },
    );
    expect(out).toEqual({
      ok: false,
      reason:
        "reminder must fire at least 1 minute from now: the requested time resolves to " +
        "2026-09-29T18:00, and it is already 2026-09-29T18:30 in the user's timezone",
    });
  });

  // #204: list_reminders' fireAt feeds straight back into atDatetime with no
  // timezone arithmetic by the model.
  test("a fireAt from list_reminders round-trips as atDatetime", async () => {
    const storage = new MemoryStorage();
    const fireAtMs = Date.UTC(2026, 8, 29, 17, 0);
    await storage.reminders.save(reminder({ id: "r1", fireAtMs }));
    const moscow = {
      ...ctx,
      now: Date.UTC(2026, 8, 29, 15, 30),
      timezone: "Europe/Moscow",
    };
    const listed = await createListRemindersTool({ storage }).execute(
      {},
      moscow,
    );
    const out = await createEditReminderTool({ storage }).execute(
      { reminderId: "r1", atDatetime: listed.reminders[0]!.fireAt },
      moscow,
    );
    expect(out).toEqual({ ok: true, fireAt: "2026-09-29T20:00" });
    expect((await storage.reminders.get("r1"))?.fireAtMs).toBe(fireAtMs);
  });

  test("a note-only edit is allowed even when the reminder is about to fire", async () => {
    const storage = new MemoryStorage();
    // fireAtMs is only 10s after now — below MIN_LEAD, but we're not moving it.
    await storage.reminders.save(reminder({ id: "r1", fireAtMs: 1_010_000 }));
    const tool = createEditReminderTool({ storage });
    const out = await tool.execute({ reminderId: "r1", text: "tweak" }, ctx);
    expect(out).toEqual({
      ok: true,
      fireAt: "1970-01-01T00:16",
    });
    expect((await storage.reminders.get("r1"))?.text).toBe("tweak");
  });

  test("refuses to edit another user's reminder", async () => {
    const storage = new MemoryStorage();
    await storage.reminders.save(
      reminder({ id: "r1", userId: "u2", text: "theirs" }),
    );
    const effects: ToolEffect[] = [];
    const tool = createEditReminderTool({ storage });
    const out = await tool.execute(
      { reminderId: "r1", text: "hijack" },
      { ...ctx, effects },
    );
    expect(out.ok).toBe(false);
    expect((await storage.reminders.get("r1"))?.text).toBe("theirs");
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
    await storage.reminders.save(reminder({ id: "r1", text: "main-scope" }));
    const tool = createEditReminderTool({ storage });
    const out = await tool.execute(
      { reminderId: "r1", text: "x" },
      { ...ctx, botId: "bot9" },
    );
    expect(out.ok).toBe(false);
    expect((await storage.reminders.get("r1"))?.text).toBe("main-scope");
  });
});
