import type { ToolCallContext } from "../registry";
import type { DeliveryTarget } from "../../../reminders/types";
import { MIN_LEAD_MS } from "../../../reminders/types";
import type { Storage } from "../../../storage/types";
import { isValidTimezone } from "../../../shared/types";

export function buildDeliveryTarget(ctx: ToolCallContext): DeliveryTarget {
  if (ctx.source === "ask") {
    if (ctx.replyToMessageId === null) {
      throw new Error("ask context must carry replyToMessageId");
    }
    return {
      kind: "ask_reply",
      chatId: ctx.chatId,
      replyToMessageId: ctx.replyToMessageId,
    };
  }
  return { kind: "guest_dm", userId: ctx.userId };
}

export type PersistResult =
  | { ok: true; fireAt: string; reminderId: string }
  | { ok: false; reason: string };

export async function persistReminder(
  storage: Storage,
  ctx: ToolCallContext,
  fireAtMs: number,
  text: string,
): Promise<PersistResult> {
  if (fireAtMs - ctx.now < MIN_LEAD_MS) {
    return {
      ok: false,
      reason: "reminder must fire at least 1 minute from now",
    };
  }

  if (ctx.source === "guest") {
    const allowed = await storage.userHasPrivateChat(ctx.userId);
    if (!allowed) {
      return {
        ok: false,
        reason:
          "user has not started a private chat with the bot yet; ask them to send /start to the bot in DM first, then retry",
      };
    }
  }

  const reminderId = crypto.randomUUID();
  await storage.saveReminder({
    id: reminderId,
    userId: ctx.userId,
    fireAtMs,
    text,
    target: buildDeliveryTarget(ctx),
    createdAtMs: ctx.now,
  });

  return {
    ok: true,
    fireAt: new Date(fireAtMs).toISOString(),
    reminderId,
  };
}

const DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export function parseAbsoluteDateTimeMs(
  datetime: string,
  timezone: string,
): { ok: true; ms: number } | { ok: false; reason: string } {
  const m = datetime.match(DATETIME_RE);
  if (!m) {
    return {
      ok: false,
      reason: "datetime must match YYYY-MM-DDTHH:MM (no seconds, no offset)",
    };
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const h = Number(m[4]);
  const mn = Number(m[5]);

  if (!isValidTimezone(timezone)) {
    return { ok: false, reason: `invalid timezone: ${timezone}` };
  }

  const utcGuess = Date.UTC(y, mo - 1, d, h, mn);
  const offsetGuess = tzOffsetMinutesAt(utcGuess, timezone);
  const utcCandidate = utcGuess - offsetGuess * 60_000;
  const offsetActual = tzOffsetMinutesAt(utcCandidate, timezone);
  const ms =
    offsetActual === offsetGuess
      ? utcCandidate
      : utcGuess - offsetActual * 60_000;

  const local = formatLocalParts(ms, timezone);
  if (
    local.year !== y ||
    local.month !== mo ||
    local.day !== d ||
    local.hour !== h ||
    local.minute !== mn
  ) {
    return {
      ok: false,
      reason:
        "this wall-clock time does not exist in the user's timezone (likely a DST spring-forward gap); pick a time before or after the gap",
    };
  }

  return { ok: true, ms };
}

function formatLocalParts(
  utcMs: number,
  tz: string,
): { year: number; month: number; day: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

function tzOffsetMinutesAt(utcMs: number, tz: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    timeZoneName: "longOffset",
  });
  const parts = fmt.formatToParts(new Date(utcMs));
  const off = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+00:00";
  const m = off.match(/GMT([+-])(\d{1,2}):?(\d{2})?/);
  if (!m) return 0;
  const sign = m[1] === "+" ? 1 : -1;
  const hours = Number(m[2]);
  const minutes = Number(m[3] ?? "0");
  return sign * (hours * 60 + minutes);
}

export type DurationUnit = "minutes" | "hours" | "days";

export function durationToMs(amount: number, unit: DurationUnit): number {
  switch (unit) {
    case "minutes":
      return amount * 60_000;
    case "hours":
      return amount * 60 * 60_000;
    case "days":
      return amount * 24 * 60 * 60_000;
  }
}
