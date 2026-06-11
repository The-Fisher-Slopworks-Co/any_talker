// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { escapeHtmlText, escapeAttrValue } from "./html";

describe("escapeHtmlText", () => {
  test("escapes &, <, >", () => {
    expect(escapeHtmlText("a & b < c > d")).toBe("a &amp; b &lt; c &gt; d");
  });
  test("does not escape quotes", () => {
    expect(escapeHtmlText('"hi"')).toBe('"hi"');
  });
});

describe("escapeAttrValue", () => {
  test("escapes &, <, >, and double quotes", () => {
    expect(escapeAttrValue('a & b < c > "d"')).toBe(
      "a &amp; b &lt; c &gt; &quot;d&quot;",
    );
  });
});
