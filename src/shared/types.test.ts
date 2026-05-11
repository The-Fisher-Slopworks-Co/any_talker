// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { messageMatchesKeyword } from "./types";

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
