// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { dragOffset, lockDirection, settle } from "./swipe";

describe("lockDirection", () => {
  test("waits until the finger has moved 8px", () => {
    expect(lockDirection(5, -6)).toBe("pending");
  });

  test("goes with the larger axis", () => {
    expect(lockDirection(-12, 4)).toBe("horizontal");
    expect(lockDirection(3, 12)).toBe("vertical");
    expect(lockDirection(10, 10)).toBe("vertical");
  });
});

describe("dragOffset", () => {
  test("follows the finger from the resting place", () => {
    expect(dragOffset(0, -30, 300)).toBe(-30);
    expect(dragOffset(-80, 30, 300)).toBe(-50);
  });

  test("stays between the left edge and the closed position", () => {
    expect(dragOffset(0, 40, 300)).toBe(0);
    expect(dragOffset(-80, -500, 300)).toBe(-300);
  });
});

describe("settle", () => {
  test("snaps open past half the action, closed before it", () => {
    expect(settle(-50, 0, 300)).toBe("open");
    expect(settle(-30, 0, 300)).toBe("closed");
  });

  test("deletes past 60% of the width", () => {
    expect(settle(-179, 0, 300)).toBe("open");
    expect(settle(-180, 0, 300)).toBe("delete");
  });

  test("lets a flick decide a short drag, but never delete", () => {
    expect(settle(-20, -0.5, 300)).toBe("open");
    expect(settle(-70, 0.5, 300)).toBe("closed");
    expect(settle(-100, -9, 300)).toBe("open");
  });
});
