// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { ToolCallContext } from "../registry";
import type { DeliveryTarget } from "../../../reminders/types";
import { MIN_LEAD_MS } from "../../../reminders/types";
import type { Storage } from "../../../storage/types";
import { parseAbsoluteDateTimeMs as parseAbsoluteDateTimeMsShared } from "../../../shared/tz";

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

export const parseAbsoluteDateTimeMs = parseAbsoluteDateTimeMsShared;

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
