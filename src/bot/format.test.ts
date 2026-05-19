// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import {
  applyBotNamePrefix,
  buildEffectsTopBlock,
  TELEGRAM_TEXT_MAX,
} from "./format";
import type { ToolEffect } from "../ai/tools/registry";

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

  test("top block sits before bot name and body", () => {
    const result = applyBotNamePrefix(
      "body",
      "Helper",
      "<blockquote>note</blockquote>\n",
    );
    expect(result.text).toBe(
      "<blockquote>note</blockquote>\n<b>Helper</b>\nbody",
    );
  });

  test("top block is retained when body is truncated", () => {
    const longBody = "a".repeat(TELEGRAM_TEXT_MAX);
    const top = "<blockquote>reminder</blockquote>\n";
    const result = applyBotNamePrefix(longBody, "Helper", top);
    expect(result.text.length).toBeLessThanOrEqual(TELEGRAM_TEXT_MAX);
    expect(result.text.startsWith(top + "<b>Helper</b>\n")).toBe(true);
    expect(result.text.endsWith("…")).toBe(true);
  });

  test("top block + no bot name", () => {
    const result = applyBotNamePrefix(
      "body",
      null,
      "<blockquote>x</blockquote>\n",
    );
    expect(result.text).toBe("<blockquote>x</blockquote>\nbody");
  });
});

describe("buildEffectsTopBlock", () => {
  const may7at10MoscowMs = Date.UTC(2026, 4, 7, 7, 0); // 07:00 UTC = 10:00 GMT+3 (Moscow)

  test("returns empty string when there are no effects", () => {
    expect(buildEffectsTopBlock([], "en")).toBe("");
  });

  test("formats a reminder_scheduled effect in Russian", () => {
    const effects: ToolEffect[] = [
      {
        type: "reminder_scheduled",
        fireAtMs: may7at10MoscowMs,
        timezone: "Europe/Moscow",
      },
    ];
    expect(buildEffectsTopBlock(effects, "ru")).toBe(
      "<blockquote>Было создано напоминание на 07.05.2026 в 10:00 (GMT+3)</blockquote>\n",
    );
  });

  test("formats a reminder_scheduled effect in English", () => {
    const effects: ToolEffect[] = [
      {
        type: "reminder_scheduled",
        fireAtMs: may7at10MoscowMs,
        timezone: "Europe/Moscow",
      },
    ];
    expect(buildEffectsTopBlock(effects, "en")).toBe(
      "<blockquote>Reminder set for 2026-05-07 at 10:00 (GMT+3)</blockquote>\n",
    );
  });

  test("formats fractional-offset timezones (e.g. Asia/Kolkata = GMT+5:30)", () => {
    const fireAtMs = Date.UTC(2026, 4, 7, 4, 30); // 04:30 UTC = 10:00 GMT+5:30
    const effects: ToolEffect[] = [
      {
        type: "reminder_scheduled",
        fireAtMs,
        timezone: "Asia/Kolkata",
      },
    ];
    expect(buildEffectsTopBlock(effects, "en")).toBe(
      "<blockquote>Reminder set for 2026-05-07 at 10:00 (GMT+5:30)</blockquote>\n",
    );
  });

  test("formats negative offsets", () => {
    const fireAtMs = Date.UTC(2026, 4, 7, 15, 0); // 15:00 UTC = 10:00 GMT-5 (NYC EST winter)
    const effects: ToolEffect[] = [
      {
        type: "reminder_scheduled",
        fireAtMs,
        timezone: "America/New_York",
      },
    ];
    // May is EDT (-4), so 15:00 UTC = 11:00 EDT
    expect(buildEffectsTopBlock(effects, "en")).toBe(
      "<blockquote>Reminder set for 2026-05-07 at 11:00 (GMT-4)</blockquote>\n",
    );
  });

  test("renders multiple effects in order", () => {
    const effects: ToolEffect[] = [
      {
        type: "reminder_scheduled",
        fireAtMs: may7at10MoscowMs,
        timezone: "Europe/Moscow",
      },
      {
        type: "reminder_scheduled",
        fireAtMs: may7at10MoscowMs + 24 * 60 * 60_000,
        timezone: "Europe/Moscow",
      },
    ];
    const result = buildEffectsTopBlock(effects, "ru");
    expect(result).toBe(
      "<blockquote>Было создано напоминание на 07.05.2026 в 10:00 (GMT+3)</blockquote>" +
        "<blockquote>Было создано напоминание на 08.05.2026 в 10:00 (GMT+3)</blockquote>\n",
    );
  });
});
