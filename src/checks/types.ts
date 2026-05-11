export type CheckCounterMode = "always_increment" | "reset_on_yes";

export const COUNTER_MODES: readonly CheckCounterMode[] = [
  "always_increment",
  "reset_on_yes",
];

export function isValidCounterMode(v: unknown): v is CheckCounterMode {
  return v === "always_increment" || v === "reset_on_yes";
}

export type RecurringCheck = {
  id: string;
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
  lastFiredAtMs: number;
  pendingMessageId: number | null;
  pendingFiredAtMs: number | null;
  createdAtMs: number;
};

export const MIN_TIMEOUT_MINUTES = 1;
export const MAX_TIMEOUT_MINUTES = 24 * 60;

export type CheckAnswer = "yes" | "no" | "timeout";

export type ValidationError =
  | "title_empty"
  | "chat_id_empty"
  | "target_user_id_empty"
  | "target_name_empty"
  | "question_empty"
  | "yes_button_empty"
  | "no_button_empty"
  | "yes_reply_empty"
  | "no_reply_empty"
  | "schedule_hour_invalid"
  | "schedule_minute_invalid"
  | "timezone_invalid"
  | "timeout_minutes_invalid"
  | "counter_invalid"
  | "counter_mode_invalid";
