// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Lang } from "../shared/i18n";
import type { SerializedAIMessage } from "../ai/types";

export type DeliveryTarget =
  | { kind: "ask_reply"; chatId: string; replyToMessageId: number }
  | { kind: "guest_dm"; userId: string };

export type Reminder = {
  id: string;
  userId: string;
  chatId: string;
  lang: Lang;
  fireAtMs: number;
  text: string;
  target: DeliveryTarget;
  createdAtMs: number;
  // Snapshot of the conversation that led to this reminder being scheduled.
  // Replayed when the reminder fires so the AI agent has the original
  // context (prior turns, attached images, etc.) and not just the note.
  contextMessages: SerializedAIMessage[];
  // Present only on a recurring reminder. Absent on every one-shot, and on
  // every record written before recurrence existed.
  recurrence?: Recurrence;
};

// A recurring reminder repeats on a fixed interval. Two shapes, because the
// families want opposite things from a DST shift: "every 20 minutes" must keep
// its spacing across one, while "every day at 18:30" must keep its wall-clock
// time and let the spacing absorb the hour.
export type RecurrenceSpec =
  | { kind: "interval"; everyMs: number }
  | {
      kind: "calendar";
      everyDays: number;
      hour: number;
      minute: number;
      timezone: string;
    };

export type Recurrence = {
  spec: RecurrenceSpec;
  // Fires still owed, counting the one at `fireAtMs`. Decremented after each
  // delivery; at zero the reminder is removed like a delivered one-shot.
  occurrencesLeft: number;
  // What `occurrencesLeft` started at, so "2 of 4 left" keeps its denominator
  // when the default limit changes under records already in the store.
  occurrencesTotal: number;
};

export const MIN_LEAD_MS = 60_000;
