// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { GrammyError, type Api } from "grammy";
import type { Reminder } from "./types";
import type { Storage } from "../storage/types";
import type { RateLimiter } from "../ratelimit/types";
import type { AIClient, AIMessage } from "../ai/types";
import { runAiTurn } from "../ai/turn";
import { deserializeMessages } from "../ai/serialize";
import type { PersonaResolver } from "../managed-bots/persona";
import { buildRichMarkdown, buildEffectsTopBlock } from "../bot/format";
import { localDateTimeString } from "../shared/tz";
import { migratedChatId } from "../shared/chat-migration";
import { composeFullName } from "../shared/types";
import { readValidDisplayName } from "../shared/display-name";
import { t } from "../shared/i18n";

export type DeliveryOutcome = "delivered" | "permanent" | "transient";

type ReminderReplyParameters = {
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

// Adapt a grammY Api into the narrow ReminderApi.
export function reminderApiFromGrammy(api: Api): ReminderApi {
  return {
    sendRichMessage: ({ chat_id, rich_message, reply_parameters }) =>
      api.sendRichMessage(
        chat_id,
        rich_message,
        reply_parameters ? { reply_parameters } : {},
      ),
    sendMessage: (chat_id, text, other) =>
      api.sendMessage(chat_id, text, other),
  };
}

export type DeliveryDeps = {
  storage: Storage;
  api: ReminderApi;
  ai: AIClient;
  // Reminder delivery re-runs the LLM, so it must charge the tokens to the
  // user's rate-limit budget and record the USD spend — otherwise reminders are
  // an invisible cost sink that bypasses both ledgers. `ownerId` gates the
  // token deduction by owner-exemption, mirroring the /ask path.
  rateLimiter: RateLimiter;
  ownerId: string;
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
    console.error(`[reminders] AI composition failed id=${reminder.id}:`, err);
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

  // Rich send with a plain-message fallback (markdown Telegram rejected, or
  // the method is unavailable on this server); the fallback's failure
  // propagates to the caller.
  const sendOnce = async (chat: string): Promise<void> => {
    try {
      await deps.api.sendRichMessage({
        chat_id: chat,
        rich_message: { markdown: body },
        ...(replyParameters ? { reply_parameters: replyParameters } : {}),
      });
    } catch (errRich) {
      console.error(
        `[reminders] sendRichMessage failed id=${reminder.id}, sending plain:`,
        errRich,
      );
      await deps.api.sendMessage(
        chat,
        body,
        replyParameters ? { reply_parameters: replyParameters } : undefined,
      );
    }
  };

  try {
    await sendOnce(chatId);
    return "delivered";
  } catch (err) {
    // The group was upgraded to a supergroup and its chat id retired — without
    // this retry the migration 400 would classify as "permanent" and silently
    // drop the reminder.
    const newChatId = migratedChatId(err);
    if (newChatId !== null) {
      console.warn(
        `[reminders] chat migrated to supergroup id=${reminder.id}, now targeting ${newChatId}`,
      );
      try {
        await sendOnce(newChatId);
        return "delivered";
      } catch (retryErr) {
        return classifySendError(retryErr);
      }
    }
    return classifySendError(err);
  }
}

function classifySendError(err: unknown): DeliveryOutcome {
  if (err instanceof GrammyError && PERMANENT_CODES.has(err.error_code)) {
    return "permanent";
  }
  return "transient";
}

async function composeReminderMessage(
  deps: DeliveryDeps,
  reminder: Reminder,
  nowMs: number,
): Promise<string> {
  const [{ settings, botName }, userTimezone, displayName, user, gender] =
    await Promise.all([
      deps.resolver(reminder.chatId),
      deps.storage.profile.getTimezone(reminder.userId),
      readValidDisplayName(deps.storage, reminder.userId),
      deps.storage.users.get(reminder.userId),
      deps.storage.profile.getGender(reminder.userId),
    ]);

  const timezone = userTimezone ?? settings.timezone;
  const lang = reminder.lang;

  const envelope = buildReminderEnvelope({
    nowMs,
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
  const messages: AIMessage[] = [...prior, { role: "user", content: envelope }];

  // Re-run the LLM and account for it (charge tokens to the user's budget +
  // record spend across the ledgers, exactly as an /ask would) in the shared
  // turn runner. `bestEffortDeduct` swallows a deduction failure: a throw would
  // surface as a transient delivery failure, retrying and re-running the model —
  // a double-spend. The owner-exempt user still skips the deduction (their spend
  // is recorded — the money is real), mirroring /ask.
  const result = await runAiTurn({
    ai: deps.ai,
    rateLimiter: deps.rateLimiter,
    storage: deps.storage,
    models: settings.models,
    systemPrompt: settings.systemPrompt,
    rateLimit: settings.rateLimit,
    routing: {
      providerSort: settings.providerSort,
      provider: settings.provider,
      serviceTier: settings.serviceTier,
    },
    userId: reminder.userId,
    ownerId: deps.ownerId,
    chatId: reminder.chatId,
    botId: deps.botId,
    // Its own source, not the `ask`/`guest` the reminder was born from: this
    // turn only words a notification, and the registry uses the label to keep
    // the reminder-writing tools away from it (see `tools/reminders/shared.ts`).
    source: "reminder_delivery",
    replyToMessageId:
      reminder.target.kind === "ask_reply"
        ? reminder.target.replyToMessageId
        : null,
    timezone,
    lang,
    now: nowMs,
    messages,
    bestEffortDeduct: true,
  });

  const trimmed = result.text.trim();
  // If the model produced nothing usable, fall back to the original note so
  // the reminder still surfaces something rather than a silent no-op delivery.
  const body = trimmed.length === 0 ? reminder.text : result.text;
  const topBlock = buildEffectsTopBlock(result.effects, lang);
  return buildRichMarkdown(body, botName, {
    topBlock,
    collapseThreshold: settings.expandableBlockquoteThreshold,
    detailsSummary: t(lang).bot_details_summary,
  }).markdown;
}

type EnvelopeArgs = {
  nowMs: number;
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
    // Everything before this envelope is the archived context of the request
    // that created the reminder — a snapshot taken before the model answered,
    // so it shows the request and nothing about it having been served. Say so,
    // or the model reads the last user message as still open and acts on it
    // again on every delivery. The registry already withholds the scheduling
    // tools here; this keeps the rest of the replayed request from being redone.
    instruction:
      "The conversation above is archived context from when this reminder was created. It was already handled — do not act on any of it again. Your only job now is to write the message that tells the user about `note`.",
    // The system prompt no longer states the current moment (it would break the
    // prompt cache — see `ai/instruction.ts`), so this event carries its own
    // `time` the way a user message does. It is not the same as
    // `scheduled_for`: a retried delivery fires later than it was due.
    time: localDateTimeString(args.nowMs, args.timezone),
    scheduled_for: formatLocalDateTime(args.fireAtMs, args.timezone),
    scheduled_at: formatLocalDateTime(args.createdAtMs, args.timezone),
    note: args.note,
  };
  if (args.displayName) obj.user_name = args.displayName;
  if (args.gender) obj.user_gender = args.gender;
  return JSON.stringify(obj);
}

// The scheduling fields name their timezone inline: they are read against a
// reminder created long ago, possibly before the user moved.
function formatLocalDateTime(ms: number, timezone: string): string {
  return `${localDateTimeString(ms, timezone)} ${timezone}`;
}
