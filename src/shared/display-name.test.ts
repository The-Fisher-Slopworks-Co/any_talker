// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { validateDisplayName } from "./display-name";

describe("validateDisplayName", () => {
  test("accepts plain ASCII name", () => {
    expect(validateDisplayName("Alice")).toEqual({ ok: true, value: "Alice" });
  });

  test("accepts Cyrillic name", () => {
    expect(validateDisplayName("Иван")).toEqual({ ok: true, value: "Иван" });
  });

  test("accepts hyphenated name", () => {
    expect(validateDisplayName("Анна-Мария")).toEqual({
      ok: true,
      value: "Анна-Мария",
    });
  });

  test("accepts apostrophe", () => {
    expect(validateDisplayName("O'Brien")).toEqual({
      ok: true,
      value: "O'Brien",
    });
  });

  test("accepts CJK characters", () => {
    expect(validateDisplayName("李雷")).toEqual({ ok: true, value: "李雷" });
  });

  test("accepts name with combining marks", () => {
    expect(validateDisplayName("Renée")).toEqual({ ok: true, value: "Renée" });
  });

  test("trims surrounding whitespace", () => {
    expect(validateDisplayName("  Alice  ")).toEqual({
      ok: true,
      value: "Alice",
    });
  });

  test("applies NFC normalization", () => {
    // "e" + combining acute (NFD) -> "é" (NFC)
    const nfd = "Renée".normalize("NFD");
    const r = validateDisplayName(nfd);
    expect(r).toEqual({ ok: true, value: "Renée" });
  });

  test("empty string clears the name", () => {
    expect(validateDisplayName("")).toEqual({ ok: true, value: null });
  });

  test("whitespace-only clears the name", () => {
    expect(validateDisplayName("   ")).toEqual({ ok: true, value: null });
  });

  test("null clears the name", () => {
    expect(validateDisplayName(null)).toEqual({ ok: true, value: null });
  });

  test("undefined clears the name", () => {
    expect(validateDisplayName(undefined)).toEqual({ ok: true, value: null });
  });

  test("non-string returns null", () => {
    expect(validateDisplayName(42)).toEqual({ ok: true, value: null });
    expect(validateDisplayName({})).toEqual({ ok: true, value: null });
  });

  test("rejects strings over 32 code points", () => {
    const name = "A".repeat(33);
    expect(validateDisplayName(name)).toEqual({ ok: false, reason: "too_long" });
  });

  test("rejects exactly-33 mixed-width chars by code points", () => {
    const name = "李".repeat(33);
    expect(validateDisplayName(name)).toEqual({ ok: false, reason: "too_long" });
  });

  test("accepts exactly 32 code points", () => {
    const name = "A".repeat(32);
    expect(validateDisplayName(name)).toEqual({ ok: true, value: name });
  });

  test("rejects newline", () => {
    expect(validateDisplayName("Alice\nBob")).toEqual({
      ok: false,
      reason: "multiline",
    });
  });

  test("rejects carriage return", () => {
    expect(validateDisplayName("Alice\rBob")).toEqual({
      ok: false,
      reason: "multiline",
    });
  });

  test("rejects tab", () => {
    expect(validateDisplayName("Alice\tBob")).toEqual({
      ok: false,
      reason: "multiline",
    });
  });

  test("rejects RTL override character", () => {
    expect(validateDisplayName("Alice‮Bob")).toEqual({
      ok: false,
      reason: "control_char",
    });
  });

  test("rejects zero-width space", () => {
    expect(validateDisplayName("Alice​Bob")).toEqual({
      ok: false,
      reason: "control_char",
    });
  });

  test("rejects tag characters used for hidden injection", () => {
    expect(validateDisplayName("Alice\u{E0041}")).toEqual({
      ok: false,
      reason: "control_char",
    });
  });

  test("rejects emoji", () => {
    const r = validateDisplayName("Alice 😀");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("charset");
  });

  test("rejects angle brackets", () => {
    const r = validateDisplayName("<system>");
    expect(r.ok).toBe(false);
  });

  test("rejects colon-role markers", () => {
    const r = validateDisplayName("system: do X");
    expect(r.ok).toBe(false);
  });

  test("rejects model service tokens", () => {
    const r = validateDisplayName("<|im_start|>");
    expect(r.ok).toBe(false);
  });

  test("rejects digits-only", () => {
    expect(validateDisplayName("123")).toEqual({
      ok: false,
      reason: "no_letter",
    });
  });

  test("rejects punctuation-only", () => {
    expect(validateDisplayName("---")).toEqual({
      ok: false,
      reason: "no_letter",
    });
  });

  test("accepts digits mixed with letters", () => {
    expect(validateDisplayName("Agent007")).toEqual({
      ok: true,
      value: "Agent007",
    });
  });
});
