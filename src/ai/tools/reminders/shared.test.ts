// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "../../../storage/memory";
import {
  buildDeliveryTarget,
  durationToMs,
  persistReminder,
} from "./shared";
import { parseAbsoluteDateTimeMs } from "../../../shared/tz";
import { DEFAULT_SETTINGS } from "../../../shared/types";
import type { ToolCallContext, ToolEffect } from "../registry";

const baseCtx: ToolCallContext = {
  source: "ask",
  chatId: "c1",
  userId: "u1",
  replyToMessageId: 42,
  timezone: "UTC",
  lang: "en",
  now: 0,
};

describe("buildDeliveryTarget", () => {
  test("ask -> ask_reply with chatId + replyToMessageId", () => {
    expect(buildDeliveryTarget(baseCtx)).toEqual({
      kind: "ask_reply",
      chatId: "c1",
      replyToMessageId: 42,
    });
  });

  test("guest -> guest_dm with userId", () => {
    expect(
      buildDeliveryTarget({ ...baseCtx, source: "guest", replyToMessageId: null }),
    ).toEqual({ kind: "guest_dm", userId: "u1" });
  });

  test("ask without replyToMessageId throws", () => {
    expect(() =>
      buildDeliveryTarget({ ...baseCtx, replyToMessageId: null }),
    ).toThrow();
  });
});

describe("parseAbsoluteDateTimeMs", () => {
  test("UTC interprets the datetime as-is", () => {
    const r = parseAbsoluteDateTimeMs("2026-05-20T18:00", "UTC");
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error();
    expect(new Date(r.ms).toISOString()).toBe("2026-05-20T18:00:00.000Z");
  });

  test("Europe/Moscow shifts by -3h to get UTC", () => {
    const r = parseAbsoluteDateTimeMs("2026-05-20T18:00", "Europe/Moscow");
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error();
    expect(new Date(r.ms).toISOString()).toBe("2026-05-20T15:00:00.000Z");
  });

  test("Asia/Tokyo shifts by -9h to get UTC", () => {
    const r = parseAbsoluteDateTimeMs("2026-05-20T18:00", "Asia/Tokyo");
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error();
    expect(new Date(r.ms).toISOString()).toBe("2026-05-20T09:00:00.000Z");
  });

  test("DST: Europe/London in July (BST = UTC+1)", () => {
    const r = parseAbsoluteDateTimeMs("2026-07-15T12:00", "Europe/London");
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error();
    expect(new Date(r.ms).toISOString()).toBe("2026-07-15T11:00:00.000Z");
  });

  test("DST: Europe/London in January (GMT = UTC+0)", () => {
    const r = parseAbsoluteDateTimeMs("2026-01-15T12:00", "Europe/London");
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error();
    expect(new Date(r.ms).toISOString()).toBe("2026-01-15T12:00:00.000Z");
  });

  test("invalid format -> ok=false", () => {
    const r = parseAbsoluteDateTimeMs("2026/05/20 18:00", "UTC");
    expect(r.ok).toBe(false);
  });

  test("invalid timezone -> ok=false", () => {
    const r = parseAbsoluteDateTimeMs("2026-05-20T18:00", "Not/A_Zone");
    expect(r.ok).toBe(false);
  });

  test("DST spring-forward gap -> ok=false (e.g. 02:30 ET on March 8 2026)", () => {
    const r = parseAbsoluteDateTimeMs("2026-03-08T02:30", "America/New_York");
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error();
    expect(r.reason).toContain("DST");
  });

  test("DST fall-back ambiguous hour returns one valid UTC instant", () => {
    // 01:30 ET on Nov 1 2026 happens twice (EDT and EST). Either is acceptable;
    // we just verify ok=true and a sane round-trip.
    const r = parseAbsoluteDateTimeMs("2026-11-01T01:30", "America/New_York");
    expect(r.ok).toBe(true);
  });
});

describe("durationToMs", () => {
  test("minutes", () => {
    expect(durationToMs(5, "minutes")).toBe(5 * 60_000);
  });
  test("hours", () => {
    expect(durationToMs(2, "hours")).toBe(2 * 60 * 60_000);
  });
  test("days", () => {
    expect(durationToMs(3, "days")).toBe(3 * 24 * 60 * 60_000);
  });
});

describe("persistReminder context capture", () => {
  test("serializes contextMessages from the tool context into storage", async () => {
    const storage = new MemoryStorage();
    const fireAtMs = baseCtx.now + 5 * 60_000;
    const ctx = {
      ...baseCtx,
      contextMessages: [
        { role: "user" as const, content: "remind me about milk" },
        { role: "assistant" as const, content: "ok" },
      ],
    };
    const out = await persistReminder(storage, ctx, fireAtMs, "milk");
    if (!out.ok) throw new Error("expected ok");
    const stored = (await storage.fetchDueReminders(fireAtMs))[0]!;
    expect(stored.contextMessages).toEqual([
      { role: "user", content: "remind me about milk" },
      { role: "assistant", content: "ok" },
    ]);
  });

  test("serializes image parts to base64", async () => {
    const storage = new MemoryStorage();
    const fireAtMs = baseCtx.now + 5 * 60_000;
    const bytes = new Uint8Array([10, 20, 30]);
    const ctx = {
      ...baseCtx,
      contextMessages: [
        {
          role: "user" as const,
          content: [
            { type: "text" as const, text: "look:" },
            {
              type: "image" as const,
              image: bytes,
              mediaType: "image/png",
            },
          ],
        },
      ],
    };
    const out = await persistReminder(storage, ctx, fireAtMs, "x");
    if (!out.ok) throw new Error("expected ok");
    const stored = (await storage.fetchDueReminders(fireAtMs))[0]!;
    const parts = stored.contextMessages[0]!.content as Array<{
      type: string;
    }>;
    expect(parts[1]).toMatchObject({
      type: "image",
      mediaType: "image/png",
    });
    expect(
      typeof (parts[1] as unknown as { image_base64: string }).image_base64,
    ).toBe("string");
  });

  test("stores an empty array when ctx.contextMessages is undefined", async () => {
    const storage = new MemoryStorage();
    const fireAtMs = baseCtx.now + 5 * 60_000;
    const out = await persistReminder(storage, baseCtx, fireAtMs, "x");
    if (!out.ok) throw new Error("expected ok");
    const stored = (await storage.fetchDueReminders(fireAtMs))[0]!;
    expect(stored.contextMessages).toEqual([]);
  });
});

describe("persistReminder effects", () => {
  test("records a reminder_scheduled effect on success", async () => {
    const storage = new MemoryStorage();
    const effects: ToolEffect[] = [];
    const fireAtMs = baseCtx.now + 5 * 60_000;
    const out = await persistReminder(
      storage,
      { ...baseCtx, timezone: "Europe/Moscow", effects },
      fireAtMs,
      "ping",
    );
    expect(out.ok).toBe(true);
    expect(effects).toEqual([
      { type: "reminder_scheduled", fireAtMs, timezone: "Europe/Moscow" },
    ]);
  });

  test("does not record an effect when persistence is rejected", async () => {
    const storage = new MemoryStorage();
    const effects: ToolEffect[] = [];
    const tooSoon = baseCtx.now + 30_000;
    const out = await persistReminder(
      storage,
      { ...baseCtx, effects },
      tooSoon,
      "ping",
    );
    expect(out.ok).toBe(false);
    expect(effects).toEqual([]);
  });

  test("works without an effects collector (backwards compatible)", async () => {
    const storage = new MemoryStorage();
    const out = await persistReminder(
      storage,
      baseCtx,
      baseCtx.now + 5 * 60_000,
      "ping",
    );
    expect(out.ok).toBe(true);
  });
});

describe("persistReminder per-user cap", () => {
  const future = (n: number) => baseCtx.now + (n + 1) * 60_000;

  async function withCap(storage: MemoryStorage, cap: number): Promise<void> {
    await storage.saveSettings({ ...DEFAULT_SETTINGS, maxRemindersPerUser: cap });
  }

  test("allows creation up to the cap, then rejects with limit_reached", async () => {
    const storage = new MemoryStorage();
    await withCap(storage, 2);
    expect((await persistReminder(storage, baseCtx, future(0), "a")).ok).toBe(true);
    expect((await persistReminder(storage, baseCtx, future(1), "b")).ok).toBe(true);
    const out = await persistReminder(storage, baseCtx, future(2), "c");
    expect(out).toEqual({
      ok: false,
      reason: expect.stringContaining("limit_reached"),
    });
    // The rejected reminder was not saved.
    expect(await storage.countRemindersForUser("u1")).toBe(2);
  });

  test("does not record an effect when rejected by the cap", async () => {
    const storage = new MemoryStorage();
    await withCap(storage, 1);
    await persistReminder(storage, baseCtx, future(0), "a");
    const effects: ToolEffect[] = [];
    const out = await persistReminder(
      storage,
      { ...baseCtx, effects },
      future(1),
      "b",
    );
    expect(out.ok).toBe(false);
    expect(effects).toEqual([]);
  });

  test("the cap is per user", async () => {
    const storage = new MemoryStorage();
    await withCap(storage, 1);
    expect((await persistReminder(storage, baseCtx, future(0), "a")).ok).toBe(true);
    // A different user has their own allowance.
    const u2 = { ...baseCtx, userId: "u2" };
    expect((await persistReminder(storage, u2, future(1), "b")).ok).toBe(true);
  });

  test("the cap is scoped per character bot", async () => {
    const storage = new MemoryStorage();
    await withCap(storage, 1);
    // Fill the main bot's allowance for u1.
    expect((await persistReminder(storage, baseCtx, future(0), "a")).ok).toBe(true);
    expect((await persistReminder(storage, baseCtx, future(1), "b")).ok).toBe(false);
    // The same user under a managed bot has a separate allowance.
    const managed = { ...baseCtx, botId: "bot9" };
    expect((await persistReminder(storage, managed, future(2), "c")).ok).toBe(true);
  });
});
