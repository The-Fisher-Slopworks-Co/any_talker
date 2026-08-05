// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import {
  isEmptyChatSettings,
  isValidProviderSlug,
  isValidProviderSort,
  isValidServiceTier,
  messageMatchesKeyword,
} from "./types";

describe("messageMatchesKeyword", () => {
  test("returns false for empty text or empty keywords", () => {
    expect(messageMatchesKeyword("", ["foo"])).toBe(false);
    expect(messageMatchesKeyword("hello", [])).toBe(false);
    expect(messageMatchesKeyword("", [])).toBe(false);
  });

  test("matches substring case-insensitively", () => {
    expect(messageMatchesKeyword("Hello World", ["world"])).toBe(true);
    expect(messageMatchesKeyword("Hello WORLD", ["world"])).toBe(true);
    expect(messageMatchesKeyword("HELLO", ["HELLO"])).toBe(true);
    expect(messageMatchesKeyword("Привет МЯВКА сегодня", ["мявка"])).toBe(true);
    expect(messageMatchesKeyword("кот мявкает", ["мявка"])).toBe(true);
    expect(messageMatchesKeyword("кот мяукает", ["мявка"])).toBe(false);
  });

  test("matches any keyword in the list", () => {
    expect(messageMatchesKeyword("just a test", ["foo", "bar", "test"])).toBe(
      true,
    );
    expect(messageMatchesKeyword("nothing here", ["foo", "bar"])).toBe(false);
  });

  test("ignores empty keyword entries", () => {
    expect(messageMatchesKeyword("anything", [""])).toBe(false);
    expect(messageMatchesKeyword("anything", ["", "thing"])).toBe(true);
  });
});

describe("isValidProviderSort", () => {
  test("accepts the three routing metrics", () => {
    for (const v of ["price", "throughput", "latency"]) {
      expect(isValidProviderSort(v)).toBe(true);
    }
  });

  test("rejects anything else", () => {
    for (const v of ["", "cost", "Price", null, undefined, 1]) {
      expect(isValidProviderSort(v)).toBe(false);
    }
  });
});

describe("isValidServiceTier", () => {
  test("accepts flex and priority", () => {
    expect(isValidServiceTier("flex")).toBe(true);
    expect(isValidServiceTier("priority")).toBe(true);
  });

  test("rejects anything else, including the implicit standard tier", () => {
    for (const v of ["", "standard", "auto", null, undefined, 1]) {
      expect(isValidServiceTier(v)).toBe(false);
    }
  });
});

describe("isValidProviderSlug", () => {
  test("accepts a bare slug and its variant/region forms", () => {
    for (const v of [
      "deepinfra",
      "deepinfra/fp4",
      "amazon-bedrock/eu-west-1",
      "google-vertex/us-east5",
      "a.b/c",
    ]) {
      expect(isValidProviderSlug(v)).toBe(true);
    }
  });

  test("rejects malformed slugs", () => {
    for (const v of [
      "",
      "/leading",
      "trailing/",
      "has space",
      "double//slash",
      "-leading-dash",
      "trailing-dash-",
      `${"a".repeat(101)}`,
      null,
      undefined,
      42,
    ]) {
      expect(isValidProviderSlug(v)).toBe(false);
    }
  });
});

describe("isEmptyChatSettings", () => {
  test("an object with no keys is empty", () => {
    expect(isEmptyChatSettings({})).toBe(true);
  });

  // Each override, on its own, must keep the row alive — otherwise a chat that
  // only pins a provider would be deleted as "empty" on the next save.
  test("any single routing override makes it non-empty", () => {
    expect(isEmptyChatSettings({ providerSort: "price" })).toBe(false);
    expect(isEmptyChatSettings({ provider: "deepinfra" })).toBe(false);
    expect(isEmptyChatSettings({ serviceTier: "flex" })).toBe(false);
    // An explicit null is a real override too: "ignore the global pin here".
    expect(isEmptyChatSettings({ provider: null })).toBe(false);
  });
});
