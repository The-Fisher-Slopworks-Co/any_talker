// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { buildProviderRouting } from "./openrouter";

describe("buildProviderRouting", () => {
  test("returns undefined when neither provider nor sort is set", () => {
    expect(buildProviderRouting(null, null)).toBeUndefined();
    expect(buildProviderRouting(undefined, undefined)).toBeUndefined();
  });

  test("maps a sort to provider.sort", () => {
    expect(buildProviderRouting(null, "price")).toEqual({ sort: "price" });
  });

  test("pins a specific provider with fallbacks disabled", () => {
    expect(buildProviderRouting("deepinfra/fp4", null)).toEqual({
      order: ["deepinfra/fp4"],
      allow_fallbacks: false,
    });
  });

  test("a pinned provider wins over a sort", () => {
    expect(buildProviderRouting("deepinfra/fp4", "throughput")).toEqual({
      order: ["deepinfra/fp4"],
      allow_fallbacks: false,
    });
  });
});
