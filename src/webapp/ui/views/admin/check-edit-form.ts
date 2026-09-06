// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type {
  CheckCounterMode,
  RecurringCheck,
} from "../../../../checks/types";

// What a brand-new check starts as. The wording is content the admin edits, not
// UI chrome, so it is not translated.
export const DEFAULT_DRAFT = {
  title: "",
  chatId: "",
  targetUserId: "",
  targetName: "",
  scheduleHour: 23,
  scheduleMinute: 30,
  timezone: "Europe/Moscow",
  question: "{name}, занялся ли ты сегодня спортом?",
  yesButton: "Да",
  noButton: "Нет",
  yesReply: "{name}, хотя бы себе не ври. День без спорта {count}",
  noReply: "{name}. День без спорта {count}",
  timeoutMinutes: 25,
  counter: 0,
  counterMode: "always_increment" as CheckCounterMode,
  counterAnchorDate: null as string | null,
  enabled: true,
};

export type CheckDraft = typeof DEFAULT_DRAFT;

export function checkToDraft(c: RecurringCheck): CheckDraft {
  return {
    title: c.title,
    chatId: c.chatId,
    targetUserId: c.targetUserId,
    targetName: c.targetName,
    scheduleHour: c.scheduleHour,
    scheduleMinute: c.scheduleMinute,
    timezone: c.timezone,
    question: c.question,
    yesButton: c.yesButton,
    noButton: c.noButton,
    yesReply: c.yesReply,
    noReply: c.noReply,
    timeoutMinutes: c.timeoutMinutes,
    counter: c.counter,
    counterMode: c.counterMode,
    counterAnchorDate: c.counterAnchorDate ?? null,
    enabled: c.enabled,
  };
}
