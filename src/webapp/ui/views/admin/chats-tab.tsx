// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../../i18n-context";
import { api } from "../../api-client";
import {
  Card,
  SectionFooter,
  SectionHeader,
  Stack,
} from "../../components/layout";
import { EmptyState, LoadingState } from "../../components/states";
import { NavRow } from "../../components/select-row";
import { chatSubtitle, chatTitle } from "../../lib/labels";
import { useLoadable } from "../../lib/use-loadable";

export function ChatsTab({ onEdit }: { onEdit: (id: string) => void }) {
  const { t: s } = useI18n();
  const { data: chats } = useLoadable(
    () => api.listAdminChats().then((r) => r.chats),
    [],
  );

  if (chats === null) return <LoadingState />;

  return (
    <Stack>
      <SectionHeader>{s.ui_chats_all}</SectionHeader>
      <Card>
        {chats.length === 0 ? (
          <EmptyState>{s.ui_chats_empty}</EmptyState>
        ) : (
          chats.map((c) => (
            <NavRow
              key={c.id}
              title={chatTitle(s, c)}
              subtitle={chatSubtitle(c)}
              onClick={() => onEdit(c.id)}
            />
          ))
        )}
      </Card>
      <SectionFooter>{s.ui_chats_footer}</SectionFooter>
    </Stack>
  );
}
