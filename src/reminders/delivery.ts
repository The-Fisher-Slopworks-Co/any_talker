import { GrammyError } from "grammy";
import type { Reminder } from "./types";

export type DeliveryOutcome = "delivered" | "permanent" | "transient";

export type ReminderApi = {
  sendMessage(
    chat_id: string | number,
    text: string,
    other?: {
      reply_parameters?: {
        message_id: number;
        allow_sending_without_reply?: boolean;
      };
    },
  ): Promise<unknown>;
};

const PERMANENT_CODES = new Set([400, 403, 404]);

export async function deliverReminder(
  api: ReminderApi,
  reminder: Reminder,
): Promise<DeliveryOutcome> {
  try {
    if (reminder.target.kind === "ask_reply") {
      await api.sendMessage(reminder.target.chatId, reminder.text, {
        reply_parameters: {
          message_id: reminder.target.replyToMessageId,
          allow_sending_without_reply: true,
        },
      });
    } else {
      await api.sendMessage(reminder.target.userId, reminder.text);
    }
    return "delivered";
  } catch (err) {
    if (err instanceof GrammyError && PERMANENT_CODES.has(err.error_code)) {
      return "permanent";
    }
    return "transient";
  }
}
