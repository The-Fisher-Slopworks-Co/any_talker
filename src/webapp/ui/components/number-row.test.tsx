// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { NumberRow, numberToCommit, parseNumber } from "./number-row";

describe("parseNumber", () => {
  test("reads plain and decimal numbers", () => {
    expect(parseNumber("18", {})).toBe(18);
    expect(parseNumber("0.50", {})).toBe(0.5);
    expect(parseNumber(" 3 ", {})).toBe(3);
  });

  test("rejects blank and non-numeric text", () => {
    expect(parseNumber("", {})).toBeNull();
    expect(parseNumber("  ", {})).toBeNull();
    expect(parseNumber("abc", {})).toBeNull();
    expect(parseNumber("Infinity", {})).toBeNull();
  });

  test("enforces integer, min and max", () => {
    expect(parseNumber("2.5", { integer: true })).toBeNull();
    expect(parseNumber("2", { integer: true })).toBe(2);
    expect(parseNumber("-1", { min: 0 })).toBeNull();
    expect(parseNumber("0", { min: 0 })).toBe(0);
    expect(parseNumber("11", { max: 10 })).toBeNull();
  });
});

describe("numberToCommit", () => {
  test("commits a valid, different value", () => {
    expect(numberToCommit("20", 18, {})).toBe(20);
  });

  test("skips an unchanged value, even if typed differently", () => {
    expect(numberToCommit("18.00", 18, {})).toBeNull();
  });

  test("skips an invalid value so the field snaps back", () => {
    expect(numberToCommit("", 18, {})).toBeNull();
    expect(numberToCommit("0", 18, { min: 1 })).toBeNull();
  });
});

describe("NumberRow markup", () => {
  test("shows the label, the padded value and the units", () => {
    const html = renderToStaticMarkup(
      <NumberRow
        label="User Spike"
        prefix="$"
        suffix="/day"
        decimals={2}
        value={0.5}
        onCommit={() => {}}
      />,
    );
    expect(html).toContain("User Spike");
    expect(html).toContain('value="0.50"');
    expect(html).toContain("$");
    expect(html).toContain("/day");
    expect(html).not.toContain("ml-1");
  });

  test("sets a word unit off by a space and keeps a precise value", () => {
    const html = renderToStaticMarkup(
      <NumberRow
        label="Window"
        suffix="days"
        decimals={2}
        value={0.005}
        onCommit={() => {}}
      />,
    );
    expect(html).toContain('value="0.005"');
    expect(html).toContain("ml-1");
  });
});
