import { isValidTimezone } from "../shared/types";
import {
  MAX_TIMEOUT_MINUTES,
  MIN_TIMEOUT_MINUTES,
  isValidCounterMode,
  type CheckCounterMode,
  type ValidationError,
} from "./types";

export type CheckInputFields = {
  title: string;
  chatId: string;
  targetUserId: string;
  targetName: string;
  scheduleHour: number;
  scheduleMinute: number;
  timezone: string;
  question: string;
  yesButton: string;
  noButton: string;
  yesReply: string;
  noReply: string;
  timeoutMinutes: number;
  counter: number;
  counterMode: CheckCounterMode;
  enabled: boolean;
};

export type NormalizedCheckInput =
  | { ok: true; value: CheckInputFields }
  | { ok: false; error: ValidationError };

export function normalizeCheckInput(raw: unknown): NormalizedCheckInput {
  if (raw === null || typeof raw !== "object") {
    return { ok: false, error: "title_empty" };
  }
  const b = raw as Record<string, unknown>;

  const title = typeof b.title === "string" ? b.title.trim() : "";
  if (title.length === 0) return { ok: false, error: "title_empty" };

  const chatId = typeof b.chatId === "string" ? b.chatId.trim() : "";
  if (chatId.length === 0) return { ok: false, error: "chat_id_empty" };

  const targetUserId =
    typeof b.targetUserId === "string" ? b.targetUserId.trim() : "";
  if (targetUserId.length === 0) {
    return { ok: false, error: "target_user_id_empty" };
  }

  const targetName =
    typeof b.targetName === "string" ? b.targetName.trim() : "";
  if (targetName.length === 0) {
    return { ok: false, error: "target_name_empty" };
  }

  const question = typeof b.question === "string" ? b.question.trim() : "";
  if (question.length === 0) return { ok: false, error: "question_empty" };

  const yesButton =
    typeof b.yesButton === "string" ? b.yesButton.trim() : "";
  if (yesButton.length === 0) {
    return { ok: false, error: "yes_button_empty" };
  }

  const noButton = typeof b.noButton === "string" ? b.noButton.trim() : "";
  if (noButton.length === 0) return { ok: false, error: "no_button_empty" };

  const yesReply = typeof b.yesReply === "string" ? b.yesReply.trim() : "";
  if (yesReply.length === 0) return { ok: false, error: "yes_reply_empty" };

  const noReply = typeof b.noReply === "string" ? b.noReply.trim() : "";
  if (noReply.length === 0) return { ok: false, error: "no_reply_empty" };

  if (
    typeof b.scheduleHour !== "number" ||
    !Number.isInteger(b.scheduleHour) ||
    b.scheduleHour < 0 ||
    b.scheduleHour > 23
  ) {
    return { ok: false, error: "schedule_hour_invalid" };
  }
  if (
    typeof b.scheduleMinute !== "number" ||
    !Number.isInteger(b.scheduleMinute) ||
    b.scheduleMinute < 0 ||
    b.scheduleMinute > 59
  ) {
    return { ok: false, error: "schedule_minute_invalid" };
  }

  const timezone = typeof b.timezone === "string" ? b.timezone.trim() : "";
  if (!isValidTimezone(timezone)) {
    return { ok: false, error: "timezone_invalid" };
  }

  if (
    typeof b.timeoutMinutes !== "number" ||
    !Number.isInteger(b.timeoutMinutes) ||
    b.timeoutMinutes < MIN_TIMEOUT_MINUTES ||
    b.timeoutMinutes > MAX_TIMEOUT_MINUTES
  ) {
    return { ok: false, error: "timeout_minutes_invalid" };
  }

  if (
    typeof b.counter !== "number" ||
    !Number.isInteger(b.counter) ||
    b.counter < 0
  ) {
    return { ok: false, error: "counter_invalid" };
  }

  if (!isValidCounterMode(b.counterMode)) {
    return { ok: false, error: "counter_mode_invalid" };
  }

  const enabled = b.enabled !== false;

  return {
    ok: true,
    value: {
      title,
      chatId,
      targetUserId,
      targetName,
      scheduleHour: b.scheduleHour,
      scheduleMinute: b.scheduleMinute,
      timezone,
      question,
      yesButton,
      noButton,
      yesReply,
      noReply,
      timeoutMinutes: b.timeoutMinutes,
      counter: b.counter,
      counterMode: b.counterMode,
      enabled,
    },
  };
}
