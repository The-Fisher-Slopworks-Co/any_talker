// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "../../storage/types";
import { t, type Lang } from "../../shared/i18n";
import { getOrInitSettings } from "../../settings";
import { summarizeUsage } from "../../ratelimit/window";
import { usageShare, type WindowShare } from "../../ratelimit/share";

// `/usage` — anyone asking how much of their own dual-window budget is left.
// DM-only: the answer is personal, and a group is the wrong place to broadcast
// how close someone is to their ceiling.
const COMMAND_RE = /^\/usage(?:@(\w+))?\s*$/i;

// Matches the command addressed to this bot: bare, or `@`-suffixed with this
// bot's own username — same rule as `/digest`, so `/usage@other_bot` isn't ours.
export function matchUsageCommand(
  text: string,
  selfUsername: string | undefined,
): boolean {
  const m = COMMAND_RE.exec(text.trim());
  if (!m) return false;
  const addressed = m[1];
  return (
    addressed === undefined ||
    addressed.toLowerCase() === selfUsername?.toLowerCase()
  );
}

export type UsageCommandInput = {
  storage: Storage;
  ownerId: string;
  isPrivateChat: boolean;
  fromUserId: string;
  lang: Lang;
  nowMs: number;
};

export type UsageCommandOutcome =
  | { kind: "ignored" }
  | { kind: "usage"; text: string };

// Character cells of the text progress bar. Kept short so the line survives a
// narrow phone screen without wrapping, which would break the bar in half.
export const BAR_CELLS = 10;

// Renders a percentage as a fixed-width block bar. Pure and language-neutral —
// the same figure the Web App header draws with CSS, drawn with characters.
export function progressBar(usedPercent: number): string {
  const clamped = Math.max(0, Math.min(100, usedPercent));
  // Any non-zero usage lights at least one cell: an all-empty bar next to
  // "1% used" would contradict the number beside it.
  const filled =
    clamped === 0 ? 0 : Math.max(1, Math.round((clamped / 100) * BAR_CELLS));
  return "▰".repeat(filled) + "▱".repeat(BAR_CELLS - filled);
}

function windowBlock(
  label: string,
  share: WindowShare,
  lang: Lang,
  nowMs: number,
): string {
  const line = t(lang).bot_usage_line(
    share.usedPercent,
    Math.max(0, share.resetMs - nowMs),
  );
  return `${label}\n${progressBar(share.usedPercent)} ${line}`;
}

// Builds the user's own usage report. Reads only: asking where you stand must
// never move the windows or cost budget. The report is percentage-only by
// construction — `usageShare` is the only thing this handler ever sees, so the
// token counts behind it cannot leak into the message by accident.
export async function usageCommandHandler(
  input: UsageCommandInput,
): Promise<UsageCommandOutcome> {
  // Private chats only. Silent elsewhere rather than answering "not here" —
  // same posture as `/digest`, and the command isn't in the group menu anyway.
  if (!input.isPrivateChat) return { kind: "ignored" };

  const settings = await getOrInitSettings(input.storage);
  const isOwner = input.fromUserId === input.ownerId;
  const exempt = isOwner && settings.rateLimit.ownerExempt;
  const s = t(input.lang);

  if (exempt) return { kind: "usage", text: s.bot_usage_exempt };

  const stored = await input.storage.getUserUsage(input.fromUserId);
  const share = usageShare(
    summarizeUsage(input.fromUserId, settings.rateLimit, stored, input.nowMs),
    exempt,
  );

  const text = [
    s.bot_usage_header,
    "",
    windowBlock(s.bot_usage_window_5h, share.fiveHour, input.lang, input.nowMs),
    "",
    windowBlock(
      s.bot_usage_window_weekly,
      share.weekly,
      input.lang,
      input.nowMs,
    ),
    "",
    s.bot_usage_footer,
  ].join("\n");

  return { kind: "usage", text };
}
