// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { messageMatchesKeyword, isValidProviderSlug } from "./types";

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

describe("isValidProviderSlug", () => {
  test("accepts plain and variant slugs", () => {
    expect(isValidProviderSlug("deepinfra")).toBe(true);
    expect(isValidProviderSlug("deepinfra/fp4")).toBe(true);
    expect(isValidProviderSlug("google-vertex/us-east5")).toBe(true);
    expect(isValidProviderSlug("openai")).toBe(true);
  });

  test("rejects non-strings and empty strings", () => {
    expect(isValidProviderSlug(null)).toBe(false);
    expect(isValidProviderSlug(undefined)).toBe(false);
    expect(isValidProviderSlug(123)).toBe(false);
    expect(isValidProviderSlug("")).toBe(false);
  });

  test("rejects slugs with whitespace or stray punctuation", () => {
    expect(isValidProviderSlug("not a slug")).toBe(false);
    expect(isValidProviderSlug("deepinfra!")).toBe(false);
    expect(isValidProviderSlug("/leading")).toBe(false);
    expect(isValidProviderSlug("trailing/")).toBe(false);
  });

  test("rejects an over-long slug", () => {
    expect(isValidProviderSlug("a".repeat(101))).toBe(false);
  });
});
