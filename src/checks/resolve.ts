import type { Storage } from "../storage/types";
import type { RecurringCheck, CheckAnswer } from "./types";
import { formatTemplate } from "./format";

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
}): Promise<ResolveOutcome> {
  const { storage, api, check, answer, fromUserId } = args;

  if (check.pendingMessageId === null) return { kind: "not_pending" };
  if (fromUserId !== null && fromUserId !== check.targetUserId) {
    return { kind: "wrong_user" };
  }

  const newCounter =
    answer === "yes" && check.counterMode === "reset_on_yes"
      ? 0
      : check.counter + 1;

  const replyTemplate =
    answer === "yes" ? check.yesReply : check.noReply;
  const reply = formatTemplate(replyTemplate, {
    targetUserId: check.targetUserId,
    name: check.targetName,
    count: newCounter,
  });

  try {
    await api.sendMessage(check.chatId, reply, {
      parse_mode: "HTML",
      reply_parameters: {
        message_id: check.pendingMessageId,
        allow_sending_without_reply: true,
      },
    });
  } catch (err) {
    console.error(`[checks] reply send failed id=${check.id}:`, err);
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
    counter: newCounter,
    pendingMessageId: null,
    pendingFiredAtMs: null,
  });

  return { kind: "resolved", newCounter, reply };
}

function isHarmlessEditError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const msg =
    (err as { description?: string }).description ??
    (err as { message?: string }).message ??
    "";
  return /message to edit not found|message is not modified/i.test(msg);
}
