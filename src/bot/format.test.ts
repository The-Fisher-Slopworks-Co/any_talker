import { test, expect, describe } from "bun:test";
import { applyBotNamePrefix } from "./format";

describe("applyBotNamePrefix", () => {
  test("returns body unchanged when bot name is null (HTML mode)", () => {
    expect(applyBotNamePrefix("hello", null)).toEqual({
      text: "hello",
      parseMode: "HTML",
    });
  });

  test("returns body unchanged when bot name is empty or whitespace", () => {
    expect(applyBotNamePrefix("hi", "")).toEqual({
      text: "hi",
      parseMode: "HTML",
    });
    expect(applyBotNamePrefix("hi", "   ")).toEqual({
      text: "hi",
      parseMode: "HTML",
    });
  });

  test("prefixes name with <b> when set", () => {
    expect(applyBotNamePrefix("hello there", "Helper")).toEqual({
      text: "<b>Helper</b>\nhello there",
      parseMode: "HTML",
    });
  });

  test("trims surrounding whitespace from name", () => {
    expect(applyBotNamePrefix("body", "  Bot  ")).toEqual({
      text: "<b>Bot</b>\nbody",
      parseMode: "HTML",
    });
  });

  test("escapes HTML specials in the bot name", () => {
    expect(applyBotNamePrefix("body", "A<B&C>")).toEqual({
      text: "<b>A&lt;B&amp;C&gt;</b>\nbody",
      parseMode: "HTML",
    });
  });

  test("does not re-escape body (caller passes already-sanitized HTML)", () => {
    expect(applyBotNamePrefix("<b>x</b>", "N")).toEqual({
      text: "<b>N</b>\n<b>x</b>",
      parseMode: "HTML",
    });
  });
});
