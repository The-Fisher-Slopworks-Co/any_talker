// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "../storage/types";
import type { RecurringCheck, CheckAnswer } from "./types";
import { formatQuestion, formatReply } from "./format";
import { applyAnswer, currentCount } from "./counter";
import { escapeHtmlText } from "../bot/html";

export type CheckInlineKeyboardButton = {
  text: string;
  callback_data: string;
};

export type CheckApi = {
  sendMessage(
    chat_id: string | number,
    text: string,
    other?: {
      parse_mode?: "HTML";
      reply_parameters?: {
        message_id: number;
        allow_sending_without_reply?: boolean;
      };
      reply_markup?: {
        inline_keyboard: CheckInlineKeyboardButton[][];
      };
    },
  ): Promise<{ message_id: number }>;
  editMessageText(
    chat_id: string | number,
    message_id: number,
    text: string,
    other?: {
      parse_mode?: "HTML";
    },
  ): Promise<unknown>;
  editMessageReplyMarkup(
    chat_id: string | number,
    message_id: number,
    other?: object,
  ): Promise<unknown>;
};

export type ResolveOutcome =
  | { kind: "resolved"; newCounter: number; reply: string }
  | { kind: "wrong_user" }
  | { kind: "not_pending" };

export async function resolveCheck(args: {
  storage: Storage;
  api: CheckApi;
  check: RecurringCheck;
  answer: CheckAnswer;
  fromUserId: string | null;
  nowMs?: number;
}): Promise<ResolveOutcome> {
  const { storage, api, check, answer, fromUserId } = args;
  const nowMs = args.nowMs ?? Date.now();

  if (check.pendingMessageId === null) return { kind: "not_pending" };
  if (fromUserId !== null && fromUserId !== check.targetUserId) {
    return { kind: "wrong_user" };
  }

  const { replyCount, patch } = applyAnswer(check, answer, nowMs);
  const replyTemplate =
    answer === "yes" ? check.yesReply : check.noReply;
  const reply = formatReply(replyTemplate, {
    name: check.targetName,
    count: replyCount,
  });

  try {
    await api.sendMessage(check.chatId, reply, {
      reply_parameters: {
        message_id: check.pendingMessageId,
        allow_sending_without_reply: true,
      },
    });
  } catch (err) {
    console.error(`[checks] reply send failed id=${check.id}:`, err);
  }

  const fireMs = check.pendingFiredAtMs ?? nowMs;
  const originalQuestion = formatQuestion(check.question, {
    targetUserId: check.targetUserId,
    name: check.targetName,
    count: currentCount(check, fireMs),
  });
  const statusLine =
    answer === "timeout" ? "Время на ответ истекло." : "Ответ дан.";
  const editedText = `${originalQuestion}\n${escapeHtmlText(statusLine)}`;

  try {
    await api.editMessageText(
      check.chatId,
      check.pendingMessageId,
      editedText,
      { parse_mode: "HTML" },
    );
  } catch (err) {
    if (!isHarmlessEditError(err)) {
      console.error(`[checks] edit message text failed id=${check.id}:`, err);
    }
  }

  try {
    await api.editMessageReplyMarkup(check.chatId, check.pendingMessageId);
  } catch (err) {
    if (!isHarmlessEditError(err)) {
      console.error(`[checks] edit reply markup failed id=${check.id}:`, err);
    }
  }

  await storage.saveCheck({
    ...check,
    ...patch,
    pendingMessageId: null,
    pendingFiredAtMs: null,
  });

  return { kind: "resolved", newCounter: replyCount, reply };
}

function isHarmlessEditError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const msg =
    (err as { description?: string }).description ??
    (err as { message?: string }).message ??
    "";
  return /message to edit not found|message is not modified/i.test(msg);
}
