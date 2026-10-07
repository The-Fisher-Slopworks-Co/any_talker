// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { describe, expect, test } from "bun:test";
import { onceWhenIdle } from "./idle";

// A scheduler the test fires by hand.
function manual() {
  const queued = new Set<() => void>();
  const schedule = (fn: () => void) => {
    queued.add(fn);
    return () => void queued.delete(fn);
  };
  const fire = () => {
    for (const fn of queued) {
      queued.delete(fn);
      fn();
    }
  };
  return { schedule, fire, queued };
}

describe("onceWhenIdle", () => {
  test("waits for the idle moment, then runs the task once", () => {
    const { schedule, fire, queued } = manual();
    let runs = 0;
    const request = onceWhenIdle(() => runs++, schedule);
    request();
    expect(runs).toBe(0);
    fire();
    expect(runs).toBe(1);
    // Asked again (the home shown a second time): nothing more is scheduled.
    request();
    expect(queued.size).toBe(0);
    expect(runs).toBe(1);
  });

  test("a request cancelled before it ran leaves the task to the next one", () => {
    const { schedule, fire } = manual();
    let runs = 0;
    const request = onceWhenIdle(() => runs++, schedule);
    request()();
    fire();
    expect(runs).toBe(0);
    request();
    fire();
    expect(runs).toBe(1);
  });

  test("two requests out at once still run it once", () => {
    const { schedule, fire } = manual();
    let runs = 0;
    const request = onceWhenIdle(() => runs++, schedule);
    request();
    request();
    fire();
    expect(runs).toBe(1);
  });
});
