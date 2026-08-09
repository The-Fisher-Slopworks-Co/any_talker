// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { formatUsd as usd, type SpendOverview } from "../spending/overview";
import type { SpendSummary } from "../spending/window";
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

// Everything Rich Markdown would otherwise read as syntax inside a table cell:
// `|` ends the cell, and the rest open emphasis / code / highlight / LaTeX /
// HTML runs. Real labels hit this — a chat titled "да кто этот ваш Гатс _:|"
// would eat its own row without escaping.
const CELL_SYNTAX = /[\\`*_~\[\]|=$<]/g;

function cell(text: string): string {
  return text.replace(CELL_SYNTAX, (ch) => `\\${ch}`);
}

// A USD amount as inline code: digits render monospaced (so a column of amounts
// lines up on the decimal point) and `$…$` can't be parsed as a LaTeX run.
function money(n: number): string {
  return `\`${usd(n)}\``;
}

type Align = "left" | "right";

// A GFM table. Callers pass already-escaped cells; headers come from i18n and
// are trusted. The caller is responsible for the blank line before the table —
// without it GFM folds the header row into the preceding paragraph.
function table(headers: string[], aligns: Align[], rows: string[][]): string[] {
  const rule = aligns.map((a) => (a === "right" ? "---:" : "---"));
  return [
    `| ${headers.join(" | ")} |`,
    `| ${rule.join(" | ")} |`,
    ...rows.map((r) => `| ${r.join(" | ")} |`),
  ];
}

// The three spend tables share a shape: a label, then the same three windows.
const SPEND_ALIGN: Align[] = ["left", "right", "right", "right"];

function spendRow(label: string, spend: SpendSummary): string[] {
  return [label, money(spend.month), money(spend.week), money(spend.day)];
}

// Composes the periodic owner digest as Rich Markdown (Bot API 10.1), with the
// spend rankings as tables — the previous "$X ($Y/d)" text lines put the two
// windows the owner compares into one cramped column. Returns null when there's
// nothing to report (see `hasDigestActivity`).
export function buildDigestMarkdown(o: SpendOverview, lang: Lang): string | null {
  if (!hasDigestActivity(o)) return null;
  const s = t(lang);
  const lines: string[] = [
    `## ${s.bot_digest_header}`,
    "",
    s.bot_digest_spend(
      money(o.global.day),
      money(o.global.week),
      money(o.global.month),
    ),
  ];

  if (o.newUsers.length > 0) {
    lines.push("", s.bot_digest_new_users(o.newUsers.length), "");
    for (const u of o.newUsers.slice(0, 10)) lines.push(`- ${cell(u.label)}`);
  }
  if (o.newChats.length > 0) {
    lines.push("", s.bot_digest_new_chats(o.newChats.length), "");
    for (const c of o.newChats.slice(0, 10)) {
      lines.push(`- ${cell(c.label)} (${c.type})`);
    }
  }

  const windows = [
    s.bot_digest_col_month,
    s.bot_digest_col_week,
    s.bot_digest_col_today,
  ];

  if (o.topUsers.length > 0) {
    lines.push("", `### ${s.bot_digest_top_users}`, "");
    lines.push(
      ...table(
        [s.bot_digest_col_user, ...windows],
        SPEND_ALIGN,
        o.topUsers.map((r) => spendRow(cell(r.label), r.spend)),
      ),
    );
  }
  if (o.topChats.length > 0) {
    lines.push("", `### ${s.bot_digest_top_chats}`, "");
    lines.push(
      ...table(
        [s.bot_digest_col_chat, ...windows],
        SPEND_ALIGN,
        o.topChats.map((r) => spendRow(cell(r.label), r.spend)),
      ),
    );
  }
  if (o.models.length > 0) {
    lines.push("", `### ${s.bot_digest_top_models}`, "");
    lines.push(
      ...table(
        [s.bot_digest_col_model, ...windows],
        SPEND_ALIGN,
        o.models.map((m) =>
          spendRow(`${cell(m.modelId)}${m.unpriced ? " ⚠️" : ""}`, m.spend),
        ),
      ),
    );
  }
  if (o.topDenied.length > 0) {
    lines.push("", `### ${s.bot_digest_denials}`, "");
    lines.push(
      ...table(
        [s.bot_digest_col_user, s.bot_digest_col_denials],
        ["left", "right"],
        o.topDenied.map((d) => [cell(d.label), String(d.count)]),
      ),
    );
  }
  if (o.unpricedModels.length > 0) {
    lines.push("", s.bot_digest_unpriced(cell(o.unpricedModels.join(", "))));
  }
  return lines.join("\n");
}
