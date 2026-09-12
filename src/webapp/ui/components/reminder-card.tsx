// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../i18n-context";
import { useDateFmt } from "../datetime-context";
import type { Reminder } from "../../../reminders/types";
import type { Chat, User } from "../../../shared/types";
import { Card } from "./layout";
import { EmptyState } from "./states";
import { reminderTargetLabel, reminderUserLabel } from "../lib/labels";
import { ReminderEditForm } from "./reminder-edit-form";

// The admin's hold on the listed rows. Absent on the user's own list, which
// stays read-only.
export type ReminderCardManage = {
  editingId: string | null;
  // A delete is in flight, so the row actions stay out of reach until it settles.
  busy: boolean;
  onEdit: (id: string | null) => void;
  onSaved: (next: Reminder) => void;
  onDelete: (id: string) => void;
};

const ACTION_BTN_CLS =
  "bg-transparent border-0 p-0 text-left text-[13px] cursor-pointer disabled:opacity-50";

export function ReminderCard({
  reminders,
  chats,
  users,
  displayNames,
  showUserId,
  onUserClick,
  emptyText,
  manage,
}: {
  reminders: Reminder[];
  chats: Record<string, Chat>;
  users?: Record<string, User> | undefined;
  displayNames?: Record<string, string | null> | undefined;
  showUserId: boolean;
  onUserClick?: ((userId: string) => void) | undefined;
  emptyText: string;
  manage?: ReminderCardManage | undefined;
}) {
  const { t: s } = useI18n();
  const { format } = useDateFmt();
  return (
    <Card>
      {reminders.length === 0 ? (
        <EmptyState>{emptyText}</EmptyState>
      ) : (
        reminders.map((r) => {
          if (manage?.editingId === r.id) {
            return (
              <ReminderEditForm
                key={r.id}
                reminder={r}
                onSaved={manage.onSaved}
                onCancel={() => manage.onEdit(null)}
              />
            );
          }
          const userLabel = showUserId
            ? reminderUserLabel(r, users, displayNames)
            : null;
          const userText = userLabel
            ? `${userLabel.primary}${userLabel.secondary ? ` · ${userLabel.secondary}` : ""}`
            : null;
          return (
            <div
              key={r.id}
              className="row relative flex flex-col gap-1 px-4 py-[11px]"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="shrink-0 text-base font-medium">
                  {format(r.fireAtMs)}
                </span>
                <span className="text-[13px] text-tg-hint truncate">
                  {reminderTargetLabel(s, r, chats)}
                </span>
              </div>
              <div className="text-[15px] whitespace-pre-wrap break-words">
                {r.text}
              </div>
              {userText &&
                (onUserClick ? (
                  <button
                    className="self-start bg-transparent border-0 p-0 text-left text-[13px] text-tg-link cursor-pointer"
                    onClick={() => onUserClick(r.userId)}
                  >
                    {userText}
                  </button>
                ) : (
                  <div className="text-[13px] text-tg-hint">{userText}</div>
                ))}
              {manage && (
                <div className="flex gap-4">
                  <button
                    type="button"
                    className={`${ACTION_BTN_CLS} text-tg-link`}
                    disabled={manage.busy}
                    onClick={() => manage.onEdit(r.id)}
                  >
                    {s.ui_reminders_edit}
                  </button>
                  <button
                    type="button"
                    className={`${ACTION_BTN_CLS} text-tg-destructive`}
                    disabled={manage.busy}
                    onClick={() => manage.onDelete(r.id)}
                  >
                    {s.ui_remove}
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}
    </Card>
  );
}
