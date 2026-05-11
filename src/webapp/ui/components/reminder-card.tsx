// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../i18n-context";
import type { Reminder } from "../../../reminders/types";
import type { Chat, User } from "../../../shared/types";
import { Card } from "./layout";
import { EmptyState } from "./states";
import { reminderTargetLabel, reminderUserLabel } from "../lib/labels";

export function ReminderCard({
  reminders,
  chats,
  users,
  showUserId,
  onUserClick,
  emptyText,
}: {
  reminders: Reminder[];
  chats: Record<string, Chat>;
  users?: Record<string, User>;
  showUserId: boolean;
  onUserClick?: (userId: string) => void;
  emptyText: string;
}) {
  const { t: s } = useI18n();
  return (
    <Card>
      {reminders.length === 0 ? (
        <EmptyState>{emptyText}</EmptyState>
      ) : (
        reminders.map((r) => {
          const userLabel = showUserId ? reminderUserLabel(r, users) : null;
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
                  {new Date(r.fireAtMs).toLocaleString()}
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
            </div>
          );
        })
      )}
    </Card>
  );
}
