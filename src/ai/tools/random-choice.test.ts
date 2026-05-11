import { test, expect, describe } from "bun:test";
import { randomChoiceTool } from "./random-choice";
import type { ToolCallContext } from "./registry";

const ctx: ToolCallContext = {
  source: "ask",
  chatId: "c",
  userId: "u",
  replyToMessageId: 1,
  timezone: "UTC",
  now: 0,
};

describe("random_choice tool", () => {
  test("returns one of the provided items", async () => {
    const items = ["колбаса", "сыр", "огурцы", "хлеб с солью"];
    for (let i = 0; i < 100; i++) {
      const r = await randomChoiceTool.execute({ items }, ctx);
      expect(items).toContain(r);
    }
  });

  test("returns the only item when list has length 1", async () => {
    expect(await randomChoiceTool.execute({ items: ["only"] }, ctx)).toBe(
      "only",
    );
  });

  test("rejects empty array via zod parse", () => {
    const result = randomChoiceTool.parameters.safeParse({ items: [] });
    expect(result.success).toBe(false);
  });
});
