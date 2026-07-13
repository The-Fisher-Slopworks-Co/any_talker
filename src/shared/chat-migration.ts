// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// When a Telegram group is upgraded to a supergroup its chat id is retired:
// every send to the old id fails with 400 "group chat was upgraded to a
// supergroup chat", carrying the replacement id in
// `parameters.migrate_to_chat_id`. Callers that persist chat ids (checks,
// reminders) must repoint to the new id and retry, or they fail forever.
//
// Structural check rather than `instanceof GrammyError` so the narrow test
// doubles (CheckApi, ReminderApi) can model the error without grammY.
export function migratedChatId(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const id = (err as { parameters?: { migrate_to_chat_id?: unknown } })
    .parameters?.migrate_to_chat_id;
  return typeof id === "number" ? String(id) : null;
}
