// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useCallback, useState, type ReactNode } from "react";
import { useI18n } from "../i18n-context";
import { api, type RemindersResponse } from "../api-client";
import type { Reminder } from "../../../reminders/types";
import { SectionFooter, SectionHeader, Stack } from "../components/layout";
import { LoadingState } from "../components/states";
import { ReminderCard } from "../components/reminder-card";
import { ReminderEditForm } from "../components/reminder-edit-form";
import { TimeNote } from "../components/time-note";
import { useLoadable } from "../lib/use-loadable";
import { reminderTargetLabel, reminderUserLabel } from "../lib/labels";

export function RemindersList({
  fetchReminders,
  header,
  emptyText,
  footer,
  showUserId,
  onUserClick,
  editable = false,
}: {
  fetchReminders: () => Promise<RemindersResponse>;
  header: string;
  emptyText: string;
  footer: ReactNode;
  showUserId: boolean;
  onUserClick?: (userId: string) => void;
  // The admin listing: every row can be edited or removed.
  editable?: boolean;
}) {
  const { t: s } = useI18n();
  const { data, setData } = useLoadable(fetchReminders, [fetchReminders]);
  // The reminder open in the edit sheet.
  const [openId, setOpenId] = useState<string | null>(null);
  const close = useCallback(() => setOpenId(null), []);
  const [busy, setBusy] = useState(false);

  if (data === null) return <LoadingState />;

  const updateRows = (fn: (rows: Reminder[]) => Reminder[]) =>
    setData((prev) => prev && { ...prev, reminders: fn(prev.reminders) });

  const onSaved = (next: Reminder) => {
    updateRows((rows) =>
      rows
        .map((r) => (r.id === next.id ? next : r))
        .sort((a, b) => a.fireAtMs - b.fireAtMs),
    );
    setOpenId(null);
  };

  const onRemoved = (id: string) => {
    updateRows((rows) => rows.filter((r) => r.id !== id));
    setOpenId(null);
  };

  const onDelete = async (id: string) => {
    if (!confirm(s.ui_reminders_delete_confirm)) return;
    setBusy(true);
    try {
      await api.deleteAdminReminder(id);
      updateRows((rows) => rows.filter((r) => r.id !== id));
    } catch {
      // Nothing to undo — the row stays, one tap from a retry.
    } finally {
      setBusy(false);
    }
  };

  const open = data.reminders.find((r) => r.id === openId);
  const author = open && reminderUserLabel(open, data.users, data.displayNames);

  return (
    <Stack>
      <SectionHeader>{header}</SectionHeader>
      <ReminderCard
        reminders={data.reminders}
        chats={data.chats}
        users={data.users}
        displayNames={data.displayNames}
        showUserId={showUserId}
        onUserClick={onUserClick}
        emptyText={emptyText}
        manage={
          editable
            ? {
                busy,
                onEdit: setOpenId,
                onDelete: (id) => void onDelete(id),
              }
            : undefined
        }
      />
      <SectionFooter>
        {footer} <TimeNote />
      </SectionFooter>
      {open && author && (
        <ReminderEditForm
          key={open.id}
          reminder={open}
          where={reminderTargetLabel(s, open, data.chats)}
          author={`${author.primary}${author.secondary ? ` · ${author.secondary}` : ""}`}
          onUserClick={onUserClick}
          onSaved={onSaved}
          onDeleted={onRemoved}
          onClose={close}
        />
      )}
    </Stack>
  );
}
