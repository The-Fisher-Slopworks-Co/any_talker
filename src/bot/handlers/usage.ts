// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "../../storage/types";
import { t, type Lang } from "../../shared/i18n";
import type { WindowKind } from "../../shared/types";
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

  // Per window: the share spent, then the reset on its own line. Nothing else —
  // a header restating the question the user just asked only pushes the answer
  // further down the screen.
  const block = (kind: WindowKind, w: WindowShare) =>
    [
      s.bot_usage_line(kind, w.usedPercent),
      s.bot_usage_reset(Math.max(0, w.resetMs - input.nowMs)),
    ].join("\n");

  return {
    kind: "usage",
    text: [
      block("fiveHour", share.fiveHour),
      block("weekly", share.weekly),
    ].join("\n\n"),
  };
}
