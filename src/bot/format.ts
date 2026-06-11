// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { escapeHtmlText } from "./html";
import type { ToolEffect } from "../ai/tools/registry";
import { formatGmtOffset, formatLocalParts, tzOffsetMinutesAt } from "../shared/tz";
import { t, type Lang } from "../shared/i18n";
import { DEFAULT_EXPANDABLE_BLOCKQUOTE_THRESHOLD } from "../shared/types";

// Bot API 10.1 rich messages allow up to 32768 UTF-8 characters (vs 4096 for a
// classic message). https://core.telegram.org/bots/api#rich-message-limits
export const RICH_MESSAGE_TEXT_MAX = 32768;

// The body is the AI's Rich Markdown; the truncation marker is itself markdown.
const TRUNCATE_MARKER = "\n…";

// When truncating, look back at most this far for a whitespace boundary so we
// don't cut mid-word. Tiny next to the 32k budget, so nothing meaningful is
// lost by backing off.
const SLICE_BACKOFF = 256;

export type RichContent = { markdown: string };

// Build the Rich Markdown payload for a reply: an optional effects block and
// the bot-name prefix (both content WE control, emitted as Rich HTML so their
// dynamic text can be HTML-escaped and can't inject formatting), followed by
// the AI's untouched Rich Markdown body. Long bodies are wrapped in a
// collapsible <details> block (the rich-message analogue of the old expandable
// blockquote). The result is truncated to the 32768-char rich-message limit.
export function buildRichMarkdown(
  body: string,
  botName: string | null,
  opts: {
    topBlock?: string;
    collapseThreshold?: number;
    detailsSummary: string;
  },
): RichContent {
  const head: string[] = [];
  const top = opts.topBlock?.trim();
  if (top) head.push(top);
  const name = botName?.trim();
  if (name) head.push(`<b>${escapeHtmlText(name)}</b>`);
  // Separate every controlled block from the markdown body with a blank line so
  // the body's own block structure (headings, lists, …) parses cleanly.
  const prefix = head.length > 0 ? `${head.join("\n\n")}\n\n` : "";

  const threshold =
    opts.collapseThreshold ?? DEFAULT_EXPANDABLE_BLOCKQUOTE_THRESHOLD;
  const collapse = body.length > threshold;
  const open = collapse
    ? `<details>\n<summary>${escapeHtmlText(opts.detailsSummary)}</summary>\n\n`
    : "";
  const close = collapse ? "\n\n</details>" : "";

  const full = `${prefix}${open}${body}${close}`;
  if (full.length <= RICH_MESSAGE_TEXT_MAX) {
    return { markdown: full };
  }
  const budget =
    RICH_MESSAGE_TEXT_MAX -
    prefix.length -
    open.length -
    close.length -
    TRUNCATE_MARKER.length;
  const cut = safeSliceMarkdown(body, Math.max(budget, 0));
  return { markdown: `${prefix}${open}${cut}${TRUNCATE_MARKER}${close}` };
}

export function buildEffectsTopBlock(
  effects: ToolEffect[],
  lang: Lang,
): string {
  const lines: string[] = [];
  for (const effect of effects) {
    if (effect.type === "reminder_scheduled") {
      lines.push(renderReminderBlockquote(effect, lang));
    }
  }
  return lines.length === 0 ? "" : lines.join("") + "\n";
}

function renderReminderBlockquote(
  effect: Extract<ToolEffect, { type: "reminder_scheduled" }>,
  lang: Lang,
): string {
  const local = formatLocalParts(effect.fireAtMs, effect.timezone);
  const offset = formatGmtOffset(
    tzOffsetMinutesAt(effect.fireAtMs, effect.timezone),
  );
  const line = t(lang).bot_reminder_scheduled({
    year: local.year,
    month: local.month,
    day: local.day,
    hour: local.hour,
    minute: local.minute,
    offset,
  });
  return `<blockquote>${escapeHtmlText(line)}</blockquote>`;
}

function safeSliceMarkdown(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const boundary = Math.max(cut.lastIndexOf("\n"), cut.lastIndexOf(" "));
  if (boundary >= max - SLICE_BACKOFF && boundary > 0) {
    return cut.slice(0, boundary);
  }
  return cut;
}
