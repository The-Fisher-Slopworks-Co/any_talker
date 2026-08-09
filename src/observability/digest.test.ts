// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { buildDigestMarkdown } from "./digest";
import type { SpendOverview } from "../spending/overview";

const zero = { day: 0, week: 0, month: 0 };

const overview = (patch: Partial<SpendOverview> = {}): SpendOverview => ({
  global: zero,
  topUsers: [],
  topChats: [],
  models: [],
  topDenied: [],
  unpricedModels: [],
  newUsers: [],
  newChats: [],
  ...patch,
});

describe("buildDigestMarkdown", () => {
  test("returns null for a quiet interval", () => {
    expect(buildDigestMarkdown(overview(), "en")).toBeNull();
  });

  test("renders the user ranking as a table with one column per window", () => {
    const md = buildDigestMarkdown(
      overview({
        global: { day: 0.02, week: 0.44, month: 3.75 },
        topUsers: [
          { id: "u1", label: "@spender", spend: { day: 0.004321, week: 0.12, month: 0.91 } },
        ],
      }),
      "en",
    );
    expect(md).toContain("| User | 30d | 7d | Today |");
    expect(md).toContain("| --- | ---: | ---: | ---: |");
    expect(md).toContain(
      "| @spender | `$0.910000` | `$0.120000` | `$0.004321` |",
    );
  });

  test("keeps sub-cent figures instead of rounding them to $0.00", () => {
    const md = buildDigestMarkdown(
      overview({ global: { day: 0.000123, week: 0.004, month: 0.02 } }),
      "en",
    )!;
    expect(md).toContain("$0.000123");
    expect(md).not.toContain("$0.00 ");
  });

  test("escapes Rich Markdown syntax in labels so a row can't break the table", () => {
    const md = buildDigestMarkdown(
      overview({
        global: { ...zero, week: 2.62, month: 2.62 },
        topChats: [
          { id: "c1", label: "да кто этот ваш Гатс _:|", spend: { ...zero, month: 2.62 } },
        ],
      }),
      "ru",
    )!;
    expect(md).toContain("| да кто этот ваш Гатс \\_:\\| |");
    // The label's pipe is escaped, so the row still has exactly four cells.
    const row = md.split("\n").find((l) => l.includes("Гатс"))!;
    expect(row.split(/(?<!\\)\|/)).toHaveLength(6); // leading + 4 cells + trailing
  });

  test("flags an unpriced model in its table row", () => {
    const md = buildDigestMarkdown(
      overview({
        models: [
          { modelId: "vendor/model-x", spend: { ...zero, month: 1.95 }, unpriced: false },
          { modelId: "vendor/model-y", spend: { ...zero, month: 0.1 }, unpriced: true },
        ],
        unpricedModels: ["vendor/model-y"],
      }),
      "en",
    )!;
    expect(md).toContain("| vendor/model-x | `$1.950000` |");
    expect(md).toContain("| vendor/model-y ⚠️ | `$0.100000` |");
  });

  test("puts a blank line before each table so GFM parses it as one", () => {
    const md = buildDigestMarkdown(
      overview({
        global: { ...zero, week: 1 },
        topUsers: [{ id: "u1", label: "@a", spend: zero }],
        topDenied: [{ userId: "u2", label: "@b", count: 3 }],
      }),
      "en",
    )!;
    const lines = md.split("\n");
    for (const [i, line] of lines.entries()) {
      if (!line.startsWith("| ") || !lines[i + 1]?.startsWith("| ---")) continue;
      expect(lines[i - 1]).toBe("");
    }
  });
});
