// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { ToolCallContext } from "../registry";
import type { DeliveryTarget } from "../../../reminders/types";
import { MIN_LEAD_MS } from "../../../reminders/types";
import type { Storage } from "../../../storage/types";
import { serializeMessages } from "../../serialize";

export function buildDeliveryTarget(ctx: ToolCallContext): DeliveryTarget {
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
          "user has not started a private chat with the bot yet; ask them to send any message to the bot in DM first, then retry",
      };
    }
  }

  const reminderId = crypto.randomUUID();
  await storage.saveReminder({
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
  });

  ctx.effects?.push({
    type: "reminder_scheduled",
    fireAtMs,
    timezone: ctx.timezone,
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
