import { test, expect, describe } from "bun:test";
import { applyBotNamePrefix } from "./format";

describe("applyBotNamePrefix", () => {
  test("returns text unchanged when bot name is null", () => {
    expect(applyBotNamePrefix("hello", null)).toEqual({
      text: "hello",
      entities: undefined,
    });
  });

  test("returns text unchanged when bot name is empty or whitespace", () => {
    expect(applyBotNamePrefix("hi", "")).toEqual({
      text: "hi",
      entities: undefined,
    });
    expect(applyBotNamePrefix("hi", "   ")).toEqual({
      text: "hi",
      entities: undefined,
    });
  });

  test("prefixes name with bold entity when set", () => {
    const r = applyBotNamePrefix("hello there", "Helper");
    expect(r.text).toBe("Helper\nhello there");
    expect(r.entities).toEqual([{ type: "bold", offset: 0, length: 6 }]);
  });

  test("trims surrounding whitespace from name", () => {
    const r = applyBotNamePrefix("body", "  Bot  ");
    expect(r.text).toBe("Bot\nbody");
    expect(r.entities).toEqual([{ type: "bold", offset: 0, length: 3 }]);
  });

  test("uses UTF-16 length for non-ASCII names", () => {
    const r = applyBotNamePrefix("body", "Имя");
    expect(r.text).toBe("Имя\nbody");
    expect(r.entities).toEqual([{ type: "bold", offset: 0, length: 3 }]);
  });

  test("counts surrogate-pair emoji as 2 UTF-16 units", () => {
    const r = applyBotNamePrefix("body", "🤖");
    expect(r.entities).toEqual([{ type: "bold", offset: 0, length: 2 }]);
  });
});
