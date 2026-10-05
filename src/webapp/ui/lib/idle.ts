// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// Calls `fn` once the page has nothing more urgent to do; returns what cancels
// it. Safari has no requestIdleCallback, so there it is a short timeout.
function whenIdle(fn: () => void): () => void {
  if (typeof requestIdleCallback === "function") {
    const id = requestIdleCallback(fn, { timeout: 2000 });
    return () => cancelIdleCallback(id);
  }
  const timer = setTimeout(fn, 200);
  return () => clearTimeout(timer);
}

// `task`, scheduled by `schedule` and run at most once however many times it
// is asked for. A request cancelled before it ran leaves it to the next one.
export function onceWhenIdle(
  task: () => void,
  schedule: (fn: () => void) => () => void = whenIdle,
): () => () => void {
  let done = false;
  return () => {
    if (done) return () => {};
    return schedule(() => {
      if (done) return;
      done = true;
      task();
    });
  };
}
