// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import {
  buildRichMarkdown,
  buildEffectsTopBlock,
  RICH_MESSAGE_TEXT_MAX,
} from "./format";
import { DEFAULT_EXPANDABLE_BLOCKQUOTE_THRESHOLD } from "../shared/types";
import type { ToolEffect } from "../ai/tools/registry";

const SUMMARY = "Expand";
const md = (
  body: string,
  botName: string | null,
  opts: { topBlock?: string; collapseThreshold?: number } = {},
) => buildRichMarkdown(body, botName, { ...opts, detailsSummary: SUMMARY }).markdown;

describe("buildRichMarkdown", () => {
  test("returns the markdown body unchanged when bot name is null", () => {
    expect(md("hello", null)).toBe("hello");
  });

  test("returns body unchanged when bot name is empty or whitespace", () => {
    expect(md("hi", "")).toBe("hi");
    expect(md("hi", "   ")).toBe("hi");
  });

  test("prefixes the name as bold HTML separated by a blank line", () => {
    expect(md("hello there", "Helper")).toBe("<b>Helper</b>\n\nhello there");
  });

  test("trims surrounding whitespace from the name", () => {
    expect(md("body", "  Bot  ")).toBe("<b>Bot</b>\n\nbody");
  });

  test("HTML-escapes the bot name so it can't inject formatting", () => {
    expect(md("body", "A<B&C>")).toBe("<b>A&lt;B&amp;C&gt;</b>\n\nbody");
  });

  test("passes the markdown body through untouched", () => {
    expect(md("**bold** _italic_ ~~s~~", "N")).toBe(
      "<b>N</b>\n\n**bold** _italic_ ~~s~~",
    );
  });

  test("does not collapse a body at or below the threshold", () => {
    const body = "a".repeat(10);
    expect(md(body, null, { collapseThreshold: 10 })).toBe(body);
  });

  test("collapses a body over the threshold into a <details> block", () => {
    const body = "a".repeat(11);
    expect(md(body, null, { collapseThreshold: 10 })).toBe(
      `<details>\n<summary>${SUMMARY}</summary>\n\n${body}\n\n</details>`,
    );
  });

  test("keeps the name prefix outside the collapsed <details> block", () => {
    const body = "a".repeat(11);
    expect(md(body, "N", { collapseThreshold: 10 })).toBe(
      `<b>N</b>\n\n<details>\n<summary>${SUMMARY}</summary>\n\n${body}\n\n</details>`,
    );
  });

  test("HTML-escapes the details summary", () => {
    const body = "a".repeat(11);
    const out = buildRichMarkdown(body, null, {
      collapseThreshold: 10,
      detailsSummary: "A<B>",
    }).markdown;
    expect(out).toContain("<summary>A&lt;B&gt;</summary>");
  });

  test("places the top block before the name and body", () => {
    expect(md("body", "Helper", { topBlock: "<blockquote>note</blockquote>\n" })).toBe(
      "<blockquote>note</blockquote>\n\n<b>Helper</b>\n\nbody",
    );
  });

  test("top block with no bot name", () => {
    expect(md("body", null, { topBlock: "<blockquote>x</blockquote>\n" })).toBe(
      "<blockquote>x</blockquote>\n\nbody",
    );
  });

  test("uses the default collapse threshold when none is given", () => {
    const atThreshold = "a".repeat(DEFAULT_EXPANDABLE_BLOCKQUOTE_THRESHOLD);
    expect(md(atThreshold, null)).toBe(atThreshold);
    const overThreshold = "a".repeat(DEFAULT_EXPANDABLE_BLOCKQUOTE_THRESHOLD + 1);
    expect(md(overThreshold, null)).toContain("<details>");
  });

  test("truncates a body exceeding the 32768-char rich-message limit", () => {
    const body = "a".repeat(RICH_MESSAGE_TEXT_MAX + 100);
    const out = md(body, null, { collapseThreshold: RICH_MESSAGE_TEXT_MAX * 2 });
    expect(out.length).toBeLessThanOrEqual(RICH_MESSAGE_TEXT_MAX);
    expect(out.endsWith("…")).toBe(true);
  });

  test("truncation keeps the <details> wrapper balanced", () => {
    const body = "a".repeat(RICH_MESSAGE_TEXT_MAX);
    const out = md(body, "Helper");
    expect(out.length).toBeLessThanOrEqual(RICH_MESSAGE_TEXT_MAX);
    expect((out.match(/<details>/g) ?? []).length).toBe(1);
    expect((out.match(/<\/details>/g) ?? []).length).toBe(1);
    expect(out).toContain("…\n\n</details>");
  });

  test("truncation backs off to a whitespace boundary", () => {
    const head = "x".repeat(RICH_MESSAGE_TEXT_MAX - 2 - 50);
    const body = `${head} ${"y".repeat(100)}`;
    const out = md(body, null, { collapseThreshold: RICH_MESSAGE_TEXT_MAX * 2 });
    expect(out.length).toBeLessThanOrEqual(RICH_MESSAGE_TEXT_MAX);
    expect(out).not.toContain("y");
    expect(out.endsWith("…")).toBe(true);
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
