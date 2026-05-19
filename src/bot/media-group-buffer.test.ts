// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import {
  createMediaGroupBuffer,
  MEDIA_GROUP_DEBOUNCE_MS,
  type Scheduler,
} from "./media-group-buffer";

type Scheduled = { fn: () => void; ms: number; id: number; cancelled: boolean };

function makeFakeScheduler() {
  const scheduled: Scheduled[] = [];
  let nextId = 1;
  const scheduler: Scheduler = {
    setTimeout(fn, ms) {
      const entry: Scheduled = { fn, ms, id: nextId++, cancelled: false };
      scheduled.push(entry);
      return entry;
    },
    clearTimeout(handle) {
      const entry = handle as Scheduled | undefined;
      if (entry) entry.cancelled = true;
    },
  };
  return {
    scheduler,
    fireLatest() {
      const remaining = scheduled.filter((s) => !s.cancelled);
      const last = remaining[remaining.length - 1];
      if (!last) throw new Error("no scheduled timer to fire");
      last.cancelled = true;
      last.fn();
    },
    activeTimers() {
      return scheduled.filter((s) => !s.cancelled).length;
    },
  };
}

describe("createMediaGroupBuffer", () => {
  test("default debounce is 500ms", () => {
    expect(MEDIA_GROUP_DEBOUNCE_MS).toBe(500);
  });

  test("flushes items after debounce fires", async () => {
    const fake = makeFakeScheduler();
    const flushes: Array<{ key: string; items: string[] }> = [];
    const buf = createMediaGroupBuffer<string, null>({
      scheduler: fake.scheduler,
      onFlush: ({ key, items }) => {
        flushes.push({ key, items });
      },
    });

    buf.push({ key: "g1", context: null, item: "a" });
    buf.push({ key: "g1", context: null, item: "b" });
    buf.push({ key: "g1", context: null, item: "c" });

    expect(buf.pendingCount()).toBe(1);
    expect(flushes).toHaveLength(0);

    fake.fireLatest();
    // onFlush is dispatched via microtask, await one tick.
    await Promise.resolve();
    expect(flushes).toEqual([{ key: "g1", items: ["a", "b", "c"] }]);
    expect(buf.pendingCount()).toBe(0);
  });

  test("each push resets the debounce timer", () => {
    const fake = makeFakeScheduler();
    const buf = createMediaGroupBuffer<string, null>({
      scheduler: fake.scheduler,
      onFlush: () => {},
    });
    buf.push({ key: "g1", context: null, item: "a" });
    expect(fake.activeTimers()).toBe(1);
    buf.push({ key: "g1", context: null, item: "b" });
    // First timer cancelled, new one scheduled.
    expect(fake.activeTimers()).toBe(1);
    buf.push({ key: "g1", context: null, item: "c" });
    expect(fake.activeTimers()).toBe(1);
  });

  test("different groups buffer independently", async () => {
    const fake = makeFakeScheduler();
    const flushed: Array<{ key: string; items: string[] }> = [];
    const buf = createMediaGroupBuffer<string, null>({
      scheduler: fake.scheduler,
      onFlush: ({ key, items }) => {
        flushed.push({ key, items });
      },
    });

    buf.push({ key: "g1", context: null, item: "a" });
    buf.push({ key: "g2", context: null, item: "x" });
    buf.push({ key: "g1", context: null, item: "b" });
    buf.push({ key: "g2", context: null, item: "y" });

    expect(buf.pendingCount()).toBe(2);

    // Fire g2 first (most recent timer), then g1.
    fake.fireLatest();
    await Promise.resolve();
    fake.fireLatest();
    await Promise.resolve();

    expect(flushed).toHaveLength(2);
    expect(flushed.find((f) => f.key === "g1")).toEqual({
      key: "g1",
      items: ["a", "b"],
    });
    expect(flushed.find((f) => f.key === "g2")).toEqual({
      key: "g2",
      items: ["x", "y"],
    });
  });

  test("captures the context from the first push only", async () => {
    const fake = makeFakeScheduler();
    const seenCtx: { value: string | null } = { value: null };
    const buf = createMediaGroupBuffer<string, string>({
      scheduler: fake.scheduler,
      onFlush: ({ context }) => {
        seenCtx.value = context;
      },
    });
    buf.push({ key: "g1", context: "first", item: "a" });
    buf.push({ key: "g1", context: "second", item: "b" });
    buf.push({ key: "g1", context: "third", item: "c" });
    fake.fireLatest();
    await Promise.resolve();
    expect(seenCtx.value).toBe("first");
  });

  test("errors thrown by onFlush do not bubble out", async () => {
    const fake = makeFakeScheduler();
    const buf = createMediaGroupBuffer<string, null>({
      scheduler: fake.scheduler,
      onFlush: () => {
        throw new Error("boom");
      },
    });
    buf.push({ key: "g1", context: null, item: "a" });
    fake.fireLatest();
    // Should not throw synchronously, and the rejected promise should be swallowed.
    await new Promise((r) => setTimeout(r, 5));
    expect(buf.pendingCount()).toBe(0);
  });

  test("group entry is cleared after flush, allowing reuse of the same key", async () => {
    const fake = makeFakeScheduler();
    const flushed: Array<string[]> = [];
    const buf = createMediaGroupBuffer<string, null>({
      scheduler: fake.scheduler,
      onFlush: ({ items }) => {
        flushed.push(items);
      },
    });
    buf.push({ key: "g1", context: null, item: "a" });
    fake.fireLatest();
    await Promise.resolve();

    buf.push({ key: "g1", context: null, item: "b" });
    fake.fireLatest();
    await Promise.resolve();

    expect(flushed).toEqual([["a"], ["b"]]);
  });
});
