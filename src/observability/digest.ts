// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { formatUsd as usd, type SpendOverview } from "../spending/overview";
import { t, type Lang } from "../shared/i18n";

// True when the interval had anything worth a DM — new users/chats, denials, an
// unpriced model, or any spend this week. A genuinely quiet bot returns false so
// the owner isn't pinged with a "nothing happened" digest.
export function hasDigestActivity(o: SpendOverview): boolean {
  return (
    o.global.week > 0 ||
    o.newUsers.length > 0 ||
    o.newChats.length > 0 ||
    o.topDenied.length > 0 ||
    o.unpricedModels.length > 0
  );
}

// Composes the periodic owner digest as plain text (sent via sendMessage).
// Returns null when there's nothing to report (see `hasDigestActivity`).
export function buildDigestText(o: SpendOverview, lang: Lang): string | null {
  if (!hasDigestActivity(o)) return null;
  const s = t(lang);
  const lines: string[] = [
    s.bot_digest_header,
    s.bot_digest_spend(usd(o.global.day), usd(o.global.week), usd(o.global.month)),
  ];

  if (o.newUsers.length > 0) {
    lines.push("", s.bot_digest_new_users(o.newUsers.length));
    for (const u of o.newUsers.slice(0, 10)) lines.push(`• ${u.label}`);
  }
  if (o.newChats.length > 0) {
    lines.push("", s.bot_digest_new_chats(o.newChats.length));
    for (const c of o.newChats.slice(0, 10)) lines.push(`• ${c.label} (${c.type})`);
  }
  if (o.topUsers.length > 0) {
    lines.push("", s.bot_digest_top_users);
    for (const r of o.topUsers) {
      lines.push(`• ${r.label} — ${usd(r.spend.month)} (${usd(r.spend.day)}/d)`);
    }
  }
  if (o.topChats.length > 0) {
    lines.push("", s.bot_digest_top_chats);
    for (const r of o.topChats) {
      lines.push(`• ${r.label} — ${usd(r.spend.month)} (${usd(r.spend.day)}/d)`);
    }
  }
  if (o.models.length > 0) {
    lines.push("", s.bot_digest_top_models);
    for (const m of o.models) {
      lines.push(`• ${m.modelId} — ${usd(m.spend.month)}${m.unpriced ? " ⚠️" : ""}`);
    }
  }
  if (o.topDenied.length > 0) {
    lines.push("", s.bot_digest_denials);
    for (const d of o.topDenied) lines.push(`• ${d.label} — ${d.count}`);
  }
  if (o.unpricedModels.length > 0) {
    lines.push("", s.bot_digest_unpriced(o.unpricedModels.join(", ")));
  }
  return lines.join("\n");
}
