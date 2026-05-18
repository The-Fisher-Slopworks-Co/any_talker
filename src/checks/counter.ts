// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { localDateString } from "../shared/tz";
import type { CheckAnswer, RecurringCheck } from "./types";

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidAnchorDate(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const m = v.match(ISO_DATE_RE);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  // Round-trip through Date.UTC to reject e.g. 2025-02-30.
  const ms = Date.UTC(y, mo - 1, d);
  const dt = new Date(ms);
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === mo - 1 &&
    dt.getUTCDate() === d
  );
}

function daysBetween(fromIso: string, toIso: string): number {
  const f = parseIso(fromIso);
  const t = parseIso(toIso);
  return Math.round((t - f) / 86_400_000);
}

function parseIso(iso: string): number {
  const m = iso.match(ISO_DATE_RE)!;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

// Counter value to show when firing the question or composing the reply.
// For date mode, it's recomputed live from the anchor (clamped at 0 so a
// future anchor reads as 0 rather than a negative day count); for number
// mode, it's the stored value.
export function currentCount(check: RecurringCheck, nowMs: number): number {
  const anchor = check.counterAnchorDate;
  if (anchor === null) return check.counter;
  const today = localDateString(nowMs, check.timezone);
  return Math.max(0, daysBetween(anchor, today));
}

// Counter shown in the reply after `answer` is processed, plus the
// persisted updates the resolver should write back.
export function applyAnswer(
  check: RecurringCheck,
  answer: CheckAnswer,
  nowMs: number,
): {
  replyCount: number;
  patch: Pick<RecurringCheck, "counter" | "counterAnchorDate">;
} {
  const anchor = check.counterAnchorDate;
  if (anchor !== null) {
    if (answer === "yes" && check.counterMode === "reset_on_yes") {
      const today = localDateString(nowMs, check.timezone);
      return {
        replyCount: 0,
        patch: { counter: check.counter, counterAnchorDate: today },
      };
    }
    return {
      replyCount: currentCount(check, nowMs),
      patch: { counter: check.counter, counterAnchorDate: anchor },
    };
  }

  const newCounter =
    answer === "yes" && check.counterMode === "reset_on_yes"
      ? 0
      : check.counter + 1;
  return {
    replyCount: newCounter,
    patch: { counter: newCounter, counterAnchorDate: null },
  };
}
