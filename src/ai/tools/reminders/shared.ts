// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { ToolCallContext } from "../registry";
import type { DeliveryTarget, Recurrence } from "../../../reminders/types";
import { MIN_LEAD_MS } from "../../../reminders/types";
import type { Storage } from "../../../storage/types";
import { getOrInitSettings } from "../../../settings";
import { serializeMessages } from "../../serialize";

// The sources a reminder-writing tool is offered to — everything but a reminder
// delivery. A delivery turn replays the archived context of the request that
// created the reminder, and that snapshot ends *before* the model answered: it
// holds "remind me about every class this week" and no trace of the reminders
// scheduled in response. Handed the scheduling tools, the model reads an
// unserved request and serves it again on every single delivery.
export const REMINDER_WRITE_SOURCES = ["ask", "guest"] as const;

export function buildDeliveryTarget(ctx: ToolCallContext): DeliveryTarget {
  if (ctx.source === "reminder_delivery") {
    // Unreachable while every writing tool declares REMINDER_WRITE_SOURCES;
    // kept so one that forgets to fails loudly instead of filing the delivery's
    // own chat as a guest DM.
    throw new Error("reminder writes are not available during a delivery");
  }
  if (ctx.source === "ask") {
    if (ctx.replyToMessageId === null) {
      throw new Error("ask context must carry replyToMessageId");
    }
    if (ctx.chatId === "") {
      throw new Error("ask context must carry a non-empty chatId");
    }
    return {
      kind: "ask_reply",
      chatId: ctx.chatId,
      replyToMessageId: ctx.replyToMessageId,
    };
  }
  if (ctx.userId === "") {
    throw new Error("guest context must carry a non-empty userId");
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
  // Omitted for a one-shot. A recurring reminder is one record with one id and
  // one slot of the per-user cap, so everything below is shared verbatim.
  recurrence?: Recurrence,
): Promise<PersistResult> {
  if (fireAtMs - ctx.now < MIN_LEAD_MS) {
    return {
      ok: false,
      reason: "reminder must fire at least 1 minute from now",
    };
  }

  // Scope the reminder (and the private-chat check that gates guest DMs) to the
  // bot this turn runs under, so each character keeps its own reminders and the
  // right scheduler fires them.
  const scoped = storage.forBot(ctx.botId ?? null);

  if (ctx.source === "guest") {
    const allowed = await scoped.privateChats.has(ctx.userId);
    if (!allowed) {
      return {
        ok: false,
        reason:
          "user has not started a private chat with the bot yet; ask them to send any message to the bot in DM first, then retry",
      };
    }
  }

  // Per-user reminder cap, shared across the whole bot family: reminders are
  // stored per character scope, so the cap counts the main bot's scope and
  // every managed bot's (plus the current turn's, normally already among
  // them). The store counts and writes atomically — the model routinely emits
  // a whole series of schedule calls in one round and the agent runtime runs
  // them in parallel, so a check-then-save pair here would let every one of
  // them see the same pre-write count and sail past the cap together.
  const { maxRemindersPerUser } = await getOrInitSettings(storage);
  const managedBots = await storage.managedBots.list();
  const scopeIds: (string | null)[] = [
    null,
    ctx.botId ?? null,
    ...managedBots.map((bot) => bot.botId),
  ];

  const reminderId = crypto.randomUUID();
  const saved = await scoped.reminders.saveIfUnderCap(
    {
      id: reminderId,
      userId: ctx.userId,
      chatId: ctx.chatId,
      lang: ctx.lang,
      fireAtMs,
      text,
      target: buildDeliveryTarget(ctx),
      createdAtMs: ctx.now,
      contextMessages: ctx.contextMessages
        ? serializeMessages(ctx.contextMessages)
        : [],
      ...(recurrence ? { recurrence } : {}),
    },
    maxRemindersPerUser,
    scopeIds,
  );
  if (!saved.ok) {
    return {
      ok: false,
      reason: `limit_reached: the user already has the maximum of ${maxRemindersPerUser} active reminders across all characters; ask them to cancel some before adding more`,
    };
  }

  ctx.effects?.push({
    type: "reminder_scheduled",
    fireAtMs,
    timezone: ctx.timezone,
    ...(recurrence ? { occurrences: recurrence.occurrencesTotal } : {}),
  });

  return {
    ok: true,
    fireAt: new Date(fireAtMs).toISOString(),
    reminderId,
  };
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
