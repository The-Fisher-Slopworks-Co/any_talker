// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "../../storage/types";
import type { Lang } from "../../shared/i18n";
import { gatherSpendOverview } from "../../spending/overview";
import { buildDigestMarkdown } from "../../observability/digest";
import { DIGEST_LIMIT } from "../../observability/scheduler";

// `/digest` — the owner asking for the periodic budget digest now instead of
// waiting out the cadence (up to `digestIntervalHours`, previously only
// reachable by editing `at:digest_state` by hand).
const COMMAND_RE = /^\/digest(?:@(\w+))?\s*$/i;

// Matches the command addressed to this bot: bare, or `@`-suffixed with this
// bot's own username. `/digest@other_bot` in a shared chat is not ours.
export function matchDigestCommand(
  text: string,
  selfUsername: string | undefined,
): boolean {
  const m = COMMAND_RE.exec(text.trim());
  if (!m) return false;
  const addressed = m[1];
  return addressed === undefined || addressed.toLowerCase() === selfUsername?.toLowerCase();
}

export type DigestCommandInput = {
  storage: Storage;
  ownerId: string;
  isPrivateChat: boolean;
  fromUserId: string;
  lang: Lang;
  nowMs: number;
};

export type DigestCommandOutcome =
  | { kind: "ignored" }
  | { kind: "empty" }
  | { kind: "digest"; markdown: string };

// Fallback window when no digest has ever been sent (the scheduler hasn't
// established its baseline yet) — matches the default digest cadence, so a
// manual run reports the same "new since" span a scheduled one would.
const FALLBACK_WINDOW_MS = 24 * 60 * 60 * 1000;

// Builds the digest on demand. Deliberately does NOT touch `at:digest_state`:
// asking for a digest shouldn't reset the cadence or blank out the "new since
// last digest" span of the next scheduled one — reading is free, and the owner
// is exempt from the budget anyway.
export async function digestCommandHandler(
  input: DigestCommandInput,
): Promise<DigestCommandOutcome> {
  // Silent for everyone else: an unprivileged user learns nothing about which
  // commands exist, matching how `contactHandler` treats a non-owner.
  if (!input.isPrivateChat) return { kind: "ignored" };
  if (input.fromUserId !== input.ownerId) return { kind: "ignored" };

  const state = await input.storage.getDigestState();
  const newSinceMs = state?.lastSentAtMs ?? input.nowMs - FALLBACK_WINDOW_MS;

  const overview = await gatherSpendOverview(input.storage, input.nowMs, {
    limit: DIGEST_LIMIT,
    newSinceMs,
    excludePrivateChats: true,
  });
  const markdown = buildDigestMarkdown(overview, input.lang);
  // A quiet period yields no digest at all — the scheduler stays silent there,
  // but someone who typed the command deserves an answer either way.
  return markdown === null ? { kind: "empty" } : { kind: "digest", markdown };
}
