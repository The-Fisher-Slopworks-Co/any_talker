// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

export const MEDIA_GROUP_DEBOUNCE_MS = 500;

export type Scheduler = {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

const defaultScheduler: Scheduler = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) =>
    globalThis.clearTimeout(h as ReturnType<typeof globalThis.setTimeout>),
};

export type MediaGroupBuffer<TItem, TContext> = {
  push(args: { key: string; context: TContext; item: TItem }): void;
  pendingCount(): number;
};

export function createMediaGroupBuffer<TItem, TContext>(opts: {
  debounceMs?: number;
  onFlush: (args: {
    key: string;
    context: TContext;
    items: TItem[];
  }) => void | Promise<void>;
  scheduler?: Scheduler;
}): MediaGroupBuffer<TItem, TContext> {
  const debounceMs = opts.debounceMs ?? MEDIA_GROUP_DEBOUNCE_MS;
  const sched = opts.scheduler ?? defaultScheduler;
  const pending = new Map<
    string,
    { items: TItem[]; context: TContext; timer: unknown }
  >();

  const flush = (key: string) => {
    const entry = pending.get(key);
    if (!entry) return;
    pending.delete(key);
    Promise.resolve()
      .then(() =>
        opts.onFlush({ key, context: entry.context, items: entry.items }),
      )
      .catch((err) => console.error("media group flush failed:", err));
  };

  return {
    push({ key, context, item }) {
      const existing = pending.get(key);
      if (existing) {
        sched.clearTimeout(existing.timer);
        existing.items.push(item);
        existing.timer = sched.setTimeout(() => flush(key), debounceMs);
      } else {
        const entry: { items: TItem[]; context: TContext; timer: unknown } = {
          items: [item],
          context,
          timer: undefined,
        };
        pending.set(key, entry);
        entry.timer = sched.setTimeout(() => flush(key), debounceMs);
      }
    },
    pendingCount() {
      return pending.size;
    },
  };
}
