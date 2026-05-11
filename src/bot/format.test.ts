// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { applyBotNamePrefix, TELEGRAM_TEXT_MAX } from "./format";

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

  test("truncates body so prefix + body fits in Telegram's 4096-char limit", () => {
    const longBody = "a".repeat(TELEGRAM_TEXT_MAX);
    const result = applyBotNamePrefix(longBody, "Helper");
    expect(result.text.length).toBeLessThanOrEqual(TELEGRAM_TEXT_MAX);
    expect(result.text.startsWith("<b>Helper</b>\n")).toBe(true);
    expect(result.text.endsWith("…")).toBe(true);
  });

  test("truncates without prefix when body alone exceeds the limit", () => {
    const longBody = "a".repeat(TELEGRAM_TEXT_MAX + 100);
    const result = applyBotNamePrefix(longBody, null);
    expect(result.text.length).toBeLessThanOrEqual(TELEGRAM_TEXT_MAX);
    expect(result.text.endsWith("…")).toBe(true);
  });

  test("does not cut inside an HTML tag during truncation", () => {
    const padding = "x".repeat(TELEGRAM_TEXT_MAX - 30);
    const body = `${padding}<b>important content</b>`;
    const result = applyBotNamePrefix(body, "Bot");
    const openCount = (result.text.match(/</g) ?? []).length;
    const closeCount = (result.text.match(/>/g) ?? []).length;
    expect(openCount).toBe(closeCount);
  });

  test("does not cut inside an HTML entity during truncation", () => {
    const padding = "x".repeat(TELEGRAM_TEXT_MAX - 20);
    const body = `${padding}&amp;tail`;
    const result = applyBotNamePrefix(body, "Bot");
    expect(result.text).not.toContain("&am…");
    expect(result.text).not.toContain("&amp…");
  });

  test("leaves short replies untouched", () => {
    const result = applyBotNamePrefix("short body", "Helper");
    expect(result.text).toBe("<b>Helper</b>\nshort body");
    expect(result.text.endsWith("…")).toBe(false);
  });
});
