import { test, expect, describe } from "bun:test";
import { randomNumberTool } from "./random-number";

describe("random_number tool", () => {
  test("returns integer in [min, max]", async () => {
    for (let i = 0; i < 100; i++) {
      const r = await randomNumberTool.execute({ min: 1, max: 10 });
      expect(Number.isInteger(r)).toBe(true);
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(10);
    }
  });

  test("works when min == max", async () => {
    expect(await randomNumberTool.execute({ min: 7, max: 7 })).toBe(7);
  });

  test("rejects min > max via zod parse", () => {
    const result = randomNumberTool.parameters.safeParse({ min: 10, max: 1 });
    expect(result.success).toBe(false);
  });
});
