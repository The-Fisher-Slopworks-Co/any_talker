// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { formatPricePerMillion } from "./model-catalog";

describe("formatPricePerMillion", () => {
  test("drops trailing zeros: whole dollars stay whole", () => {
    expect(formatPricePerMillion(0.000003)).toBe("$3/M");
    expect(formatPricePerMillion(0.000015)).toBe("$15/M");
    expect(formatPricePerMillion(0.00000025)).toBe("$0.25/M");
  });

  test("keeps more places the cheaper a price gets", () => {
    expect(formatPricePerMillion(0.000000075)).toBe("$0.075/M");
    expect(formatPricePerMillion(0.00000001)).toBe("$0.01/M");
    expect(formatPricePerMillion(0.000000005)).toBe("$0.005/M");
  });

  test("free and unpriced models", () => {
    expect(formatPricePerMillion(0)).toBe("Free");
    expect(formatPricePerMillion(undefined)).toBeNull();
  });
});
