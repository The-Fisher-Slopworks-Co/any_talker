// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { escapeHtmlText } from "./html";
import type { ToolEffect } from "../ai/tools/registry";
import { formatGmtOffset, formatLocalParts, tzOffsetMinutesAt } from "../shared/tz";
import { t, type Lang } from "../shared/i18n";

export type DecoratedMessage = {
  text: string;
  parseMode: "HTML";
};

export const TELEGRAM_TEXT_MAX = 4096;
const TRUNCATE_MARKER = "\n…";
const MAX_ENTITY_LENGTH = 10;

export function applyBotNamePrefix(
  sanitizedBody: string,
  botName: string | null,
  topBlock?: string,
): DecoratedMessage {
  const trimmed = botName?.trim() ?? "";
  const namePart =
    trimmed.length === 0 ? "" : `<b>${escapeHtmlText(trimmed)}</b>\n`;
  const prefix = (topBlock ?? "") + namePart;
  const fullText = prefix + sanitizedBody;
  if (fullText.length <= TELEGRAM_TEXT_MAX) {
    return { text: fullText, parseMode: "HTML" };
  }
  const budget = TELEGRAM_TEXT_MAX - prefix.length - TRUNCATE_MARKER.length;
  const cut = safeSliceHtml(sanitizedBody, Math.max(budget, 0));
  return { text: prefix + cut + TRUNCATE_MARKER, parseMode: "HTML" };
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

function safeSliceHtml(html: string, max: number): string {
  if (html.length <= max) return html;
  let cut = html.slice(0, max);
  const lastOpen = cut.lastIndexOf("<");
  const lastClose = cut.lastIndexOf(">");
  if (lastOpen > lastClose) {
    cut = cut.slice(0, lastOpen);
  }
  const lastAmp = cut.lastIndexOf("&");
  const lastSemi = cut.lastIndexOf(";");
  if (lastAmp > lastSemi && cut.length - lastAmp <= MAX_ENTITY_LENGTH) {
    cut = cut.slice(0, lastAmp);
  }
  return cut;
}
