// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { escapeAttrValue, escapeHtmlText } from "../bot/html";

// `{name}` becomes a clickable tg://user mention so the user gets pinged;
// the rest of the template is HTML-escaped so plain-text input from the
// owner survives parse_mode=HTML.
export function formatQuestion(
  template: string,
  vars: { targetUserId: string; name: string; count: number },
): string {
  const nonce = crypto.randomUUID();
  const nameSentinel = `xN${nonce}x`;
  const countSentinel = `xC${nonce}x`;

  const nameHtml = `<a href="tg://user?id=${escapeAttrValue(vars.targetUserId)}">${escapeHtmlText(vars.name)}</a>`;
  const countHtml = escapeHtmlText(String(vars.count));

  return escapeHtmlText(
    template
      .replaceAll("{name}", nameSentinel)
      .replaceAll("{count}", countSentinel),
  )
    .replaceAll(nameSentinel, nameHtml)
    .replaceAll(countSentinel, countHtml);
}

export function formatReply(
  template: string,
  vars: { name: string; count: number },
): string {
  return template
    .replaceAll("{name}", vars.name)
    .replaceAll("{count}", String(vars.count));
}
