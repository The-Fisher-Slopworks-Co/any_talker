// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../i18n-context";
import { useDateFmt } from "../datetime-context";
import type { Reminder } from "../../../reminders/types";
import type { Chat, User } from "../../../shared/types";
import { Card } from "./layout";
import { NavRow } from "./select-row";
import { SwipeToDelete } from "./swipe-row";
import { EmptyState } from "./states";
import { reminderTargetLabel, reminderUserLabel } from "../lib/labels";

// The admin's hold on the listed rows: tap one to open it, swipe it to delete
// it. Absent on the user's own list, which stays read-only.
export type ReminderCardManage = {
  onOpen: (id: string) => void;
  // Rejects when the reminder could not be deleted, so the row slides back.
  onDelete: (id: string) => Promise<void>;
};

export function ReminderCard({
  reminders,
  chats,
  users,
  displayNames,
  emptyText,
  manage,
}: {
  reminders: Reminder[];
  chats: Record<string, Chat>;
  users?: Record<string, User> | undefined;
  displayNames?: Record<string, string | null> | undefined;
  emptyText: string;
  manage?: ReminderCardManage | undefined;
}) {
  const { t: s } = useI18n();
  const { format, short } = useDateFmt();
  return (
    <Card>
      {reminders.length === 0 ? (
        <EmptyState>{emptyText}</EmptyState>
      ) : (
        reminders.map((r) => {
          const target = reminderTargetLabel(s, r, chats);
          if (manage) {
            const { primary } = reminderUserLabel(r, users, displayNames);
            return (
              <SwipeToDelete
                key={r.id}
                label={s.ui_reminders_delete}
                onDelete={() => manage.onDelete(r.id)}
              >
                <NavRow
                  wrapTitle
                  title={r.text}
                  subtitle={`${short(r.fireAtMs)} · ${primary} · ${target}`}
                  onClick={() => manage.onOpen(r.id)}
                />
              </SwipeToDelete>
            );
          }
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
                  {target}
                </span>
              </div>
              <div className="text-[15px] whitespace-pre-wrap break-words">
                {r.text}
              </div>
            </div>
          );
        })
      )}
    </Card>
  );
}
