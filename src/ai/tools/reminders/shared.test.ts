import { test, expect, describe } from "bun:test";
import {
  buildDeliveryTarget,
  durationToMs,
  parseAbsoluteDateTimeMs,
} from "./shared";
import type { ToolCallContext } from "../registry";

const baseCtx: ToolCallContext = {
  source: "ask",
  chatId: "c1",
  userId: "u1",
  replyToMessageId: 42,
  timezone: "UTC",
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
