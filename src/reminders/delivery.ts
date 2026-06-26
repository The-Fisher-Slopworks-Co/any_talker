// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { GrammyError, type Api } from "grammy";
import type { Reminder } from "./types";
import type { Storage } from "../storage/types";
import type { AIClient, AIMessage } from "../ai/types";
import { deserializeMessages } from "../ai/serialize";
import { getAllTools, type ToolEffect } from "../ai/tools/registry";
import { buildInstruction } from "../ai/instruction";
import type { PersonaResolver } from "../managed-bots/persona";
import { buildRichMarkdown, buildEffectsTopBlock } from "../bot/format";
import { richApi } from "../bot/rich";
import { formatGmtOffset, formatLocalParts, tzOffsetMinutesAt } from "../shared/tz";
import { composeFullName } from "../shared/types";
import { readValidDisplayName } from "../shared/display-name";
import { t } from "../shared/i18n";

export type DeliveryOutcome = "delivered" | "permanent" | "transient";

export type ReminderReplyParameters = {
  message_id: number;
  allow_sending_without_reply?: boolean;
};

// Reminders are delivered via Bot API 10.1 rich messages, with a plain-text
// sendMessage fallback. Kept narrow (not grammY's full Api) so the test double
// stays small; wrap a real grammY Api with `reminderApiFromGrammy`.
export type ReminderApi = {
  sendRichMessage(params: {
    chat_id: string | number;
    rich_message: { markdown: string };
    reply_parameters?: ReminderReplyParameters;
  }): Promise<unknown>;
  sendMessage(
    chat_id: string | number,
    text: string,
    other?: { reply_parameters?: ReminderReplyParameters },
  ): Promise<unknown>;
};

// Adapt a grammY Api into the narrow ReminderApi. sendRichMessage is reached
// through the raw proxy because it is newer (Bot API 10.1) than the installed
// grammY typings.
export function reminderApiFromGrammy(api: Api): ReminderApi {
  return {
    sendRichMessage: (params) => richApi(api).sendRichMessage(params),
    sendMessage: (chat_id, text, other) =>
      api.sendMessage(chat_id, text, other),
  };
}

export type DeliveryDeps = {
  storage: Storage;
  api: ReminderApi;
  ai: AIClient;
  // Resolves the character this reminder is delivered as. For a managed bot it
  // yields that bot's persona over the global settings; for the main bot, the
  // chat-derived persona (today's behavior).
  resolver: PersonaResolver;
  // Scope of the bot delivering this reminder: null = main, managed id
  // otherwise. Threaded into the re-run's tool context so a follow-up reminder
  // scheduled during delivery lands in the right character's namespace.
  botId: string | null;
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
    // Corruption of stored reminders is gated at the storage boundary
    // (parseStoredReminder quarantines bad records before they reach this
    // path), so remaining throws here are AI/storage/network failures —
    // transient retry on the next tick is correct.
    console.error(
      `[reminders] AI composition failed id=${reminder.id}:`,
      err,
    );
    return "transient";
  }

  const target = reminder.target;
  const chatId = target.kind === "ask_reply" ? target.chatId : target.userId;
  const replyParameters: ReminderReplyParameters | undefined =
    target.kind === "ask_reply"
      ? {
          message_id: target.replyToMessageId,
          allow_sending_without_reply: true,
        }
      : undefined;

  try {
    await deps.api.sendRichMessage({
      chat_id: chatId,
      rich_message: { markdown: body },
      ...(replyParameters ? { reply_parameters: replyParameters } : {}),
    });
    return "delivered";
  } catch (errRich) {
    // Rich send failed (markdown Telegram rejected, or the method is
    // unavailable on this server) — fall back to a plain message so the
    // reminder still lands.
    console.error(
      `[reminders] sendRichMessage failed id=${reminder.id}, sending plain:`,
      errRich,
    );
    try {
      await deps.api.sendMessage(
        chatId,
        body,
        replyParameters ? { reply_parameters: replyParameters } : undefined,
      );
      return "delivered";
    } catch (err) {
      if (err instanceof GrammyError && PERMANENT_CODES.has(err.error_code)) {
        return "permanent";
      }
      return "transient";
    }
  }
}

async function composeReminderMessage(
  deps: DeliveryDeps,
  reminder: Reminder,
  nowMs: number,
): Promise<string> {
  const [{ settings, botName }, userTimezone, displayName, user, gender] =
    await Promise.all([
      deps.resolver(reminder.chatId),
      deps.storage.getUserTimezone(reminder.userId),
      readValidDisplayName(deps.storage, reminder.userId),
      deps.storage.getUser(reminder.userId),
      deps.storage.getUserGender(reminder.userId),
    ]);

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
    models: settings.models,
    system: buildInstruction(settings.systemPrompt, { timezone, lang }),
    messages,
    tools: getAllTools(),
    toolCallContext: {
      source: toolSource,
      chatId: reminder.chatId,
      userId: reminder.userId,
      botId: deps.botId,
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

  const trimmed = result.text.trim();
  // If the model produced nothing usable, fall back to the original note so
  // the reminder still surfaces something rather than a silent no-op delivery.
  const body = trimmed.length === 0 ? reminder.text : result.text;
  const topBlock = buildEffectsTopBlock(effects, lang);
  return buildRichMarkdown(body, botName, {
    topBlock,
    collapseThreshold: settings.expandableBlockquoteThreshold,
    detailsSummary: t(lang).bot_details_summary,
  }).markdown;
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
