// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { escapeHtmlText } from "./html";

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
): DecoratedMessage {
  const trimmed = botName?.trim() ?? "";
  const prefix = trimmed.length === 0 ? "" : `<b>${escapeHtmlText(trimmed)}</b>\n`;
  const fullText = prefix + sanitizedBody;
  if (fullText.length <= TELEGRAM_TEXT_MAX) {
    return { text: fullText, parseMode: "HTML" };
  }
  const budget = TELEGRAM_TEXT_MAX - prefix.length - TRUNCATE_MARKER.length;
  const cut = safeSliceHtml(sanitizedBody, Math.max(budget, 0));
  return { text: prefix + cut + TRUNCATE_MARKER, parseMode: "HTML" };
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
