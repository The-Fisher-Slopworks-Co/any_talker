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

function requireNonEmptyString(
  v: unknown,
  error: ValidationError,
):
  | { ok: true; value: string }
  | { ok: false; error: ValidationError } {
  const s = typeof v === "string" ? v.trim() : "";
  if (s.length === 0) return { ok: false, error };
  return { ok: true, value: s };
}

function requireIntInRange(
  v: unknown,
  min: number,
  max: number,
  error: ValidationError,
):
  | { ok: true; value: number }
  | { ok: false; error: ValidationError } {
  if (
    typeof v !== "number" ||
    !Number.isInteger(v) ||
    v < min ||
    v > max
  ) {
    return { ok: false, error };
  }
  return { ok: true, value: v };
}

export function normalizeCheckInput(raw: unknown): NormalizedCheckInput {
  if (raw === null || typeof raw !== "object") {
    return { ok: false, error: "title_empty" };
  }
  const b = raw as Record<string, unknown>;

  const title = requireNonEmptyString(b.title, "title_empty");
  if (!title.ok) return title;
  const chatId = requireNonEmptyString(b.chatId, "chat_id_empty");
  if (!chatId.ok) return chatId;
  const targetUserId = requireNonEmptyString(
    b.targetUserId,
    "target_user_id_empty",
  );
  if (!targetUserId.ok) return targetUserId;
  const targetName = requireNonEmptyString(b.targetName, "target_name_empty");
  if (!targetName.ok) return targetName;
  const question = requireNonEmptyString(b.question, "question_empty");
  if (!question.ok) return question;
  const yesButton = requireNonEmptyString(b.yesButton, "yes_button_empty");
  if (!yesButton.ok) return yesButton;
  const noButton = requireNonEmptyString(b.noButton, "no_button_empty");
  if (!noButton.ok) return noButton;
  const yesReply = requireNonEmptyString(b.yesReply, "yes_reply_empty");
  if (!yesReply.ok) return yesReply;
  const noReply = requireNonEmptyString(b.noReply, "no_reply_empty");
  if (!noReply.ok) return noReply;

  const scheduleHour = requireIntInRange(
    b.scheduleHour,
    0,
    23,
    "schedule_hour_invalid",
  );
  if (!scheduleHour.ok) return scheduleHour;
  const scheduleMinute = requireIntInRange(
    b.scheduleMinute,
    0,
    59,
    "schedule_minute_invalid",
  );
  if (!scheduleMinute.ok) return scheduleMinute;

  const tzRaw = typeof b.timezone === "string" ? b.timezone.trim() : "";
  if (!isValidTimezone(tzRaw)) {
    return { ok: false, error: "timezone_invalid" };
  }

  const timeoutMinutes = requireIntInRange(
    b.timeoutMinutes,
    MIN_TIMEOUT_MINUTES,
    MAX_TIMEOUT_MINUTES,
    "timeout_minutes_invalid",
  );
  if (!timeoutMinutes.ok) return timeoutMinutes;

  const counter = requireIntInRange(
    b.counter,
    0,
    Number.MAX_SAFE_INTEGER,
    "counter_invalid",
  );
  if (!counter.ok) return counter;

  if (!isValidCounterMode(b.counterMode)) {
    return { ok: false, error: "counter_mode_invalid" };
  }

  return {
    ok: true,
    value: {
      title: title.value,
      chatId: chatId.value,
      targetUserId: targetUserId.value,
      targetName: targetName.value,
      scheduleHour: scheduleHour.value,
      scheduleMinute: scheduleMinute.value,
      timezone: tzRaw,
      question: question.value,
      yesButton: yesButton.value,
      noButton: noButton.value,
      yesReply: yesReply.value,
      noReply: noReply.value,
      timeoutMinutes: timeoutMinutes.value,
      counter: counter.value,
      counterMode: b.counterMode,
      enabled: b.enabled !== false,
    },
  };
}
