// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { ReactNode } from "react";
import type { RemindersResponse } from "../api-client";
import { SectionFooter, SectionHeader, Stack } from "../components/layout";
import { LoadingState } from "../components/states";
import { ReminderCard } from "../components/reminder-card";
import { useLoadable } from "../lib/use-loadable";

export function RemindersList({
  fetchReminders,
  header,
  emptyText,
  footer,
  showUserId,
  onUserClick,
}: {
  fetchReminders: () => Promise<RemindersResponse>;
  header: string;
  emptyText: string;
  footer: ReactNode;
  showUserId: boolean;
  onUserClick?: (userId: string) => void;
}) {
  const { data } = useLoadable(fetchReminders, [fetchReminders]);

  if (data === null) return <LoadingState />;

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
      />
      <SectionFooter>{footer}</SectionFooter>
    </Stack>
  );
}
