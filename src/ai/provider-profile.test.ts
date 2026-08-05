// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import {
  capabilitiesFor,
  detectProviderFlavor,
  isValidProviderFlavor,
  PROVIDER_FLAVORS,
} from "./provider-profile";

describe("detectProviderFlavor", () => {
  test("recognises the OpenRouter API host", () => {
    expect(detectProviderFlavor("https://openrouter.ai/api/v1")).toBe(
      "openrouter",
    );
  });

  test("recognises OpenRouter subdomains", () => {
    expect(detectProviderFlavor("https://gateway.openrouter.ai/api/v1")).toBe(
      "openrouter",
    );
  });

  test("is case-insensitive about the host", () => {
    expect(detectProviderFlavor("https://OpenRouter.AI/api/v1")).toBe(
      "openrouter",
    );
  });

  test("treats OpenAI itself as generic", () => {
    expect(detectProviderFlavor("https://api.openai.com/v1")).toBe("generic");
  });

  test("treats a self-hosted gateway as generic", () => {
    expect(detectProviderFlavor("http://litellm.internal:4000/v1")).toBe(
      "generic",
    );
  });

  // A host merely *containing* the string must not match — "openrouter.ai.evil.com"
  // is a different origin entirely.
  test("does not match a look-alike host", () => {
    expect(detectProviderFlavor("https://openrouter.ai.example.com/v1")).toBe(
      "generic",
    );
  });

  test("falls back to generic on an unparseable URL", () => {
    expect(detectProviderFlavor("not a url")).toBe("generic");
  });
});

describe("isValidProviderFlavor", () => {
  test("accepts every listed flavor", () => {
    for (const f of PROVIDER_FLAVORS) expect(isValidProviderFlavor(f)).toBe(true);
  });

  test("rejects anything else", () => {
    for (const v of ["auto", "", "OPENROUTER", 1, null, undefined]) {
      expect(isValidProviderFlavor(v)).toBe(false);
    }
  });
});

describe("capabilitiesFor", () => {
  test("OpenRouter exposes the proprietary surface", () => {
    expect(capabilitiesFor("openrouter")).toEqual({
      modelFallback: true,
      providerRouting: true,
      serviceTier: true,
      usageAccounting: true,
      endpointStats: true,
      unifiedReasoning: true,
    });
  });

  // The gate is load-bearing: a strict endpoint (OpenAI itself) rejects the whole
  // request with HTTP 400 when an unknown body field is present.
  test("a generic endpoint exposes none of it", () => {
    expect(capabilitiesFor("generic")).toEqual({
      modelFallback: false,
      providerRouting: false,
      serviceTier: false,
      usageAccounting: false,
      endpointStats: false,
      unifiedReasoning: false,
    });
  });

  test("returns a frozen object so callers cannot mutate the shared profile", () => {
    const caps = capabilitiesFor("generic");
    expect(Object.isFrozen(caps)).toBe(true);
  });
});
