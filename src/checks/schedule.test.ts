import { test, expect, describe } from "bun:test";
import { lastScheduledFireMs } from "./schedule";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function utc(y: number, mo: number, d: number, h: number, mn: number): number {
  return Date.UTC(y, mo - 1, d, h, mn);
}

describe("lastScheduledFireMs", () => {
  test("returns today's fire time when it's past now in UTC", () => {
    // 2026-05-11 23:35 UTC, schedule 23:30 UTC -> 2026-05-11 23:30 UTC
    const now = utc(2026, 5, 11, 23, 35);
    const got = lastScheduledFireMs(now, 23, 30, "UTC");
    expect(got).toBe(utc(2026, 5, 11, 23, 30));
  });

  test("returns yesterday's fire time when today's hasn't happened yet", () => {
    // 2026-05-11 10:00 UTC, schedule 23:30 UTC -> 2026-05-10 23:30 UTC
    const now = utc(2026, 5, 11, 10, 0);
    const got = lastScheduledFireMs(now, 23, 30, "UTC");
    expect(got).toBe(utc(2026, 5, 10, 23, 30));
  });

  test("works for Europe/Moscow timezone (MSK is UTC+3)", () => {
    // 2026-05-11 21:00 UTC == 2026-05-12 00:00 MSK
    // schedule is 23:30 MSK -> 2026-05-11 20:30 UTC
    const now = utc(2026, 5, 11, 21, 0);
    const got = lastScheduledFireMs(now, 23, 30, "Europe/Moscow");
    expect(got).toBe(utc(2026, 5, 11, 20, 30));
  });

  test("returns yesterday in MSK when today's MSK time hasn't passed", () => {
    // 2026-05-11 18:00 UTC == 2026-05-11 21:00 MSK
    // schedule is 23:30 MSK -> today's 23:30 is in future, so yesterday
    // yesterday MSK 23:30 was 2026-05-10 23:30 MSK == 2026-05-10 20:30 UTC
    const now = utc(2026, 5, 11, 18, 0);
    const got = lastScheduledFireMs(now, 23, 30, "Europe/Moscow");
    expect(got).toBe(utc(2026, 5, 10, 20, 30));
  });

  test("returned value never exceeds nowMs", () => {
    const now = utc(2026, 1, 15, 12, 0);
    const got = lastScheduledFireMs(now, 23, 30, "UTC");
    expect(got).toBeLessThanOrEqual(now);
  });

  test("returned value is within last 24 hours of now", () => {
    const now = utc(2026, 1, 15, 12, 0);
    const got = lastScheduledFireMs(now, 23, 30, "UTC");
    expect(now - got).toBeLessThan(ONE_DAY_MS + 60_000);
  });
});
