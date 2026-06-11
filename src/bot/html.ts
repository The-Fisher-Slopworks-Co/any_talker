// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// HTML-escaping helpers for the small amount of Telegram HTML the bot still
// emits itself — the controlled bits embedded in Rich Markdown replies (bot
// name, effects blockquote; see bot/format.ts) and the check-in mentions
// (checks/format.ts). AI replies are now Rich Markdown parsed by Telegram, so
// there is no longer an HTML sanitizer here.

export function escapeHtmlText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function escapeAttrValue(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
