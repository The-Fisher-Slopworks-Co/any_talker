// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { ToolCallContext } from "../registry";
import type { Reminder } from "../../../reminders/types";

// Shared fixtures for the list_reminders / cancel_reminder tool tests, which
// drive the same ask-context and seed the same reminder shape.
export const baseAskCtx: ToolCallContext = {
  source: "ask",
  chatId: "c1",
  userId: "u1",
  replyToMessageId: 100,
  timezone: "UTC",
  lang: "en",
  now: 1_000_000,
};

export function makeReminder(over: Partial<Reminder>): Reminder {
  return {
    id: over.id ?? crypto.randomUUID(),
    userId: over.userId ?? "u1",
    chatId: over.chatId ?? "c1",
    lang: over.lang ?? "en",
    fireAtMs: over.fireAtMs ?? 2_000_000,
    text: over.text ?? "note",
    target: over.target ?? {
      kind: "ask_reply",
      chatId: "c1",
      replyToMessageId: 100,
    },
    createdAtMs: over.createdAtMs ?? 1_000_000,
    contextMessages: over.contextMessages ?? [],
  };
}
