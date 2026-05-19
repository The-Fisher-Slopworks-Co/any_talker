// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { randomNumberTool } from "./random-number";
import type { ToolCallContext } from "./registry";

const ctx: ToolCallContext = {
  source: "ask",
  chatId: "c",
  userId: "u",
  replyToMessageId: 1,
  timezone: "UTC",
  lang: "en",
  now: 0,
};

describe("random_number tool", () => {
  test("returns integer in [min, max]", async () => {
    for (let i = 0; i < 100; i++) {
      const r = await randomNumberTool.execute({ min: 1, max: 10 }, ctx);
      expect(Number.isInteger(r)).toBe(true);
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(10);
    }
  });

  test("works when min == max", async () => {
    expect(await randomNumberTool.execute({ min: 7, max: 7 }, ctx)).toBe(7);
  });

  test("rejects min > max via zod parse", () => {
    const result = randomNumberTool.parameters.safeParse({ min: 10, max: 1 });
    expect(result.success).toBe(false);
  });
});
