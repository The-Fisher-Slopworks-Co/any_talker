// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { pickPhotoSize, type PhotoSizeLike } from "./photo";

const size = (id: string, w: number, h: number): PhotoSizeLike => ({
  file_id: id,
  width: w,
  height: h,
});

describe("pickPhotoSize", () => {
  test("returns null for empty input", () => {
    expect(pickPhotoSize([])).toBeNull();
  });

  test("picks largest size strictly under 1280×1280 area", () => {
    // Telegram typically returns sizes ascending: 90, 320, 800, 1280
    const sizes = [
      size("a", 90, 90),
      size("b", 320, 320),
      size("c", 800, 600),
      size("d", 1280, 960),
    ];
    // Areas: 8100, 102400, 480000, 1228800. All ≤ 1638400 → largest is d
    const picked = pickPhotoSize(sizes);
    expect(picked?.file_id).toBe("d");
  });

  test("rejects sizes whose area exceeds 1280×1280 even if width and height fit individually", () => {
    // width 1600, height 1024 → area 1638400 (== max, allowed); width 2000×1000 = 2000000 (over)
    const sizes = [
      size("small", 320, 320),
      size("at_cap", 1600, 1024), // area exactly 1638400
      size("over", 2000, 1000), // area 2000000
    ];
    const picked = pickPhotoSize(sizes);
    expect(picked?.file_id).toBe("at_cap");
  });

  test("falls back to smallest size when every size exceeds the cap", () => {
    const sizes = [
      size("big", 2400, 2400),
      size("bigger", 4000, 4000),
      size("huge", 6000, 6000),
    ];
    const picked = pickPhotoSize(sizes);
    expect(picked?.file_id).toBe("big");
  });

  test("input order does not matter", () => {
    const sizes = [
      size("d", 1280, 960),
      size("a", 90, 90),
      size("c", 800, 600),
      size("b", 320, 320),
    ];
    const picked = pickPhotoSize(sizes);
    expect(picked?.file_id).toBe("d");
  });

  test("single oversized size is returned as the smallest fallback", () => {
    const sizes = [size("only", 4000, 4000)];
    const picked = pickPhotoSize(sizes);
    expect(picked?.file_id).toBe("only");
  });
});
