// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "../../../storage/memory";
import { createCancelReminderTool } from "./cancel";
import type { ToolEffect } from "../registry";
import {
  baseAskCtx as ctx,
  makeReminder as reminder,
} from "./tool-test-fixtures";

describe("cancel_reminder", () => {
  test("schema rejects an empty id", () => {
    const storage = new MemoryStorage();
    const tool = createCancelReminderTool({ storage });
    expect(tool.parameters.safeParse({ reminderId: "" }).success).toBe(false);
  });

  test("cancels the user's own reminder and removes it", async () => {
    const storage = new MemoryStorage();
    await storage.saveReminder(reminder({ id: "r1", fireAtMs: 2_000_000 }));
    const tool = createCancelReminderTool({ storage });
    const out = await tool.execute({ reminderId: "r1" }, ctx);
    expect(out).toEqual({ cancelled: true });
    expect(await storage.getReminder("r1")).toBeNull();
    expect(await storage.countRemindersForUser("u1")).toBe(0);
  });

  test("pushes a reminder_cancelled effect with the reminder's fire time", async () => {
    const storage = new MemoryStorage();
    await storage.saveReminder(reminder({ id: "r1", fireAtMs: 2_000_000 }));
    const effects: ToolEffect[] = [];
    const tool = createCancelReminderTool({ storage });
    await tool.execute(
      { reminderId: "r1" },
      { ...ctx, timezone: "Europe/Moscow", effects },
    );
    expect(effects).toEqual([
      { type: "reminder_cancelled", fireAtMs: 2_000_000, timezone: "Europe/Moscow" },
    ]);
  });

  test("unknown id -> cancelled:false, no effect", async () => {
    const storage = new MemoryStorage();
    const effects: ToolEffect[] = [];
    const tool = createCancelReminderTool({ storage });
    const out = await tool.execute({ reminderId: "nope" }, { ...ctx, effects });
    expect(out).toEqual({ cancelled: false });
    expect(effects).toEqual([]);
  });

  test("refuses to cancel another user's reminder", async () => {
    const storage = new MemoryStorage();
    await storage.saveReminder(reminder({ id: "r1", userId: "u2" }));
    const effects: ToolEffect[] = [];
    const tool = createCancelReminderTool({ storage });
    const out = await tool.execute({ reminderId: "r1" }, { ...ctx, effects });
    expect(out).toEqual({ cancelled: false });
    // The other user's reminder is untouched.
    expect(await storage.getReminder("r1")).not.toBeNull();
    expect(effects).toEqual([]);
  });

  test("cannot cancel a reminder from a different bot scope", async () => {
    const storage = new MemoryStorage();
    // Created under the main bot namespace.
    await storage.saveReminder(reminder({ id: "r1" }));
    const tool = createCancelReminderTool({ storage });
    const out = await tool.execute({ reminderId: "r1" }, { ...ctx, botId: "bot9" });
    expect(out).toEqual({ cancelled: false });
    // Still present in the main namespace.
    expect(await storage.getReminder("r1")).not.toBeNull();
  });
});
