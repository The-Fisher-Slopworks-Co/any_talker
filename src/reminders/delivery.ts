// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { GrammyError } from "grammy";
import type { Reminder } from "./types";
import type { Storage } from "../storage/types";
import type { AIClient, AIMessage } from "../ai/types";
import { deserializeMessages } from "../ai/serialize";
import { getAllTools, type ToolEffect } from "../ai/tools/registry";
import { buildInstruction } from "../ai/instruction";
import { getEffectiveSettings } from "../settings";
import { sanitizeHtml } from "../bot/html";
import { applyBotNamePrefix, buildEffectsTopBlock } from "../bot/format";
import { formatGmtOffset, formatLocalParts, tzOffsetMinutesAt } from "../shared/tz";
import { composeFullName } from "../shared/types";
import { readValidDisplayName } from "../shared/display-name";

export type DeliveryOutcome = "delivered" | "permanent" | "transient";

export type ReminderApi = {
  sendMessage(
    chat_id: string | number,
    text: string,
    other?: {
      parse_mode?: "HTML";
      reply_parameters?: {
        message_id: number;
        allow_sending_without_reply?: boolean;
      };
    },
  ): Promise<unknown>;
};

export type DeliveryDeps = {
  storage: Storage;
  api: ReminderApi;
  ai: AIClient;
};

const PERMANENT_CODES = new Set([400, 403, 404]);

export async function deliverReminder(
  deps: DeliveryDeps,
  reminder: Reminder,
  nowMs: number,
): Promise<DeliveryOutcome> {
  let body: string;
  try {
    body = await composeReminderMessage(deps, reminder, nowMs);
  } catch (err) {
    console.error(
      `[reminders] AI composition failed id=${reminder.id}:`,
      err,
    );
    return "transient";
  }

  try {
    if (reminder.target.kind === "ask_reply") {
      await deps.api.sendMessage(reminder.target.chatId, body, {
        parse_mode: "HTML",
        reply_parameters: {
          message_id: reminder.target.replyToMessageId,
          allow_sending_without_reply: true,
        },
      });
    } else {
      await deps.api.sendMessage(reminder.target.userId, body, {
        parse_mode: "HTML",
      });
    }
    return "delivered";
  } catch (err) {
    if (err instanceof GrammyError && PERMANENT_CODES.has(err.error_code)) {
      return "permanent";
    }
    return "transient";
  }
}

async function composeReminderMessage(
  deps: DeliveryDeps,
  reminder: Reminder,
  nowMs: number,
): Promise<string> {
  const [
    settings,
    chatSettings,
    userTimezone,
    displayName,
    user,
    gender,
    byokKey,
    byokModels,
  ] = await Promise.all([
    getEffectiveSettings(deps.storage, reminder.chatId),
    deps.storage.getChatSettings(reminder.chatId),
    deps.storage.getUserTimezone(reminder.userId),
    readValidDisplayName(deps.storage, reminder.userId),
    deps.storage.getUser(reminder.userId),
    deps.storage.getUserGender(reminder.userId),
    deps.storage.getUserOpenrouterKey(reminder.userId),
    deps.storage.getUserOpenrouterModels(reminder.userId),
  ]);

  const botName = chatSettings?.botName?.trim() || null;
  const timezone = userTimezone ?? settings.timezone;
  const lang = reminder.lang;

  const envelope = buildReminderEnvelope({
    fireAtMs: reminder.fireAtMs,
    createdAtMs: reminder.createdAtMs,
    timezone,
    note: reminder.text,
    displayName:
      displayName?.trim() ||
      composeFullName(user?.firstName ?? null, user?.lastName ?? null) ||
      null,
    gender,
  });

  const prior = deserializeMessages(reminder.contextMessages);
  const messages: AIMessage[] = [
    ...prior,
    { role: "user", content: envelope },
  ];

  const effects: ToolEffect[] = [];
  const toolSource: "ask" | "guest" =
    reminder.target.kind === "ask_reply" ? "ask" : "guest";
  const result = await deps.ai.ask({
    models:
      byokKey !== null && byokModels !== null && byokModels.length > 0
        ? byokModels
        : settings.models,
    system: buildInstruction(settings.systemPrompt, { timezone, lang }),
    messages,
    tools: getAllTools(),
    providerSort: settings.providerSort,
    apiKey: byokKey,
    toolCallContext: {
      source: toolSource,
      chatId: reminder.chatId,
      userId: reminder.userId,
      replyToMessageId:
        reminder.target.kind === "ask_reply"
          ? reminder.target.replyToMessageId
          : null,
      timezone,
      lang,
      now: nowMs,
      effects,
    },
  });

  const sanitized = sanitizeHtml(result.text);
  const trimmed = sanitized.trim();
  // If the model produced nothing usable, fall back to the original note so
  // the reminder still surfaces something rather than a silent no-op delivery.
  const body = trimmed.length === 0 ? sanitizeHtml(reminder.text) : sanitized;
  const topBlock = buildEffectsTopBlock(effects, lang);
  return applyBotNamePrefix(body, botName, topBlock).text;
}

type EnvelopeArgs = {
  fireAtMs: number;
  createdAtMs: number;
  timezone: string;
  note: string;
  displayName: string | null;
  gender: "male" | "female" | null;
};

function buildReminderEnvelope(args: EnvelopeArgs): string {
  const obj: Record<string, string> = {
    system_event: "reminder_fired",
    scheduled_for: formatLocalDateTime(args.fireAtMs, args.timezone),
    scheduled_at: formatLocalDateTime(args.createdAtMs, args.timezone),
    note: args.note,
  };
  if (args.displayName) obj.user_name = args.displayName;
  if (args.gender) obj.user_gender = args.gender;
  return JSON.stringify(obj);
}

function formatLocalDateTime(ms: number, timezone: string): string {
  const p = formatLocalParts(ms, timezone);
  const offset = formatGmtOffset(tzOffsetMinutesAt(ms, timezone));
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)} ${offset}`;
}
