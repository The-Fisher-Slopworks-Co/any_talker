import { test, expect, describe } from "bun:test";
import { createSemaphore } from "./search-web";

describe("createSemaphore", () => {
  test("never exceeds the configured limit under concurrent load", async () => {
    const limit = 3;
    const sem = createSemaphore(limit, 100);
    let active = 0;
    let peak = 0;
    const tasks = Array.from({ length: 50 }, () =>
      sem(async () => {
        active++;
        peak = Math.max(peak, active);
        await Promise.resolve();
        await Promise.resolve();
        active--;
      }),
    );
    await Promise.all(tasks);
    expect(peak).toBeLessThanOrEqual(limit);
  });

  test("fully drains the queue and releases all slots", async () => {
    const sem = createSemaphore(2, 100);
    let active = 0;
    let peak = 0;
    const tasks = Array.from({ length: 20 }, () =>
      sem(async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 1));
        active--;
      }),
    );
    await Promise.all(tasks);
    expect(active).toBe(0);
    expect(peak).toBeLessThanOrEqual(2);
  });

  test("rejects when queue depth is exceeded", async () => {
    const sem = createSemaphore(1, 1);
    let release!: () => void;
    const blocking = sem(() => new Promise<void>((r) => (release = r)));
    const queued = sem(async () => {});
    await expect(sem(async () => {})).rejects.toThrow("queue full");
    release();
    await Promise.all([blocking, queued]);
  });

  test("handles permit transfer race: concurrent acquire does not over-grab", async () => {
    const sem = createSemaphore(1, 100);
    let active = 0;
    let peak = 0;
    const wrap = (label: string) =>
      sem(async () => {
        active++;
        peak = Math.max(peak, active);
        await Promise.resolve();
        active--;
        return label;
      });
    const a = wrap("a");
    const b = wrap("b");
    const c = wrap("c");
    const d = wrap("d");
    await Promise.all([a, b, c, d]);
    expect(peak).toBe(1);
  });
});
