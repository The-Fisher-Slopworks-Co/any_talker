// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../../i18n-context";
import { api } from "../../api-client";
import { Card, Stack } from "../../components/layout";
import { Avatar } from "../../components/avatar";
import { EmptyState, LoadingState } from "../../components/states";
import { NavRow } from "../../components/select-row";
import { chatAccessLabel, chatSubtitle, chatTitle } from "../../lib/labels";
import { useLoadable } from "../../lib/use-loadable";

const chatsLoad = {
  key: "admin-chats",
  load: async () => {
    const [{ chats }, whitelist, blacklist] = await Promise.all([
      api.listAdminChats(),
      api.getWhitelist(),
      api.getBlacklist(),
    ]);
    return { chats, whitelist: whitelist.chats, blacklist: blacklist.chats };
  },
};

export function ChatsTab({ onEdit }: { onEdit: (id: string) => void }) {
  const { t: s } = useI18n();
  const { data } = useLoadable(chatsLoad);

  if (data === null) return <LoadingState />;
  const { chats, whitelist, blacklist } = data;

  return (
    <Stack>
      <Card>
        {chats.length === 0 ? (
          <EmptyState>{s.ui_chats_empty}</EmptyState>
        ) : (
          chats.map((c) => (
            <NavRow
              key={c.id}
              avatar={<Avatar id={c.id} name={chatTitle(s, c)} />}
              title={chatTitle(s, c)}
              subtitle={chatSubtitle(s, c)}
              value={chatAccessLabel(s, c.id, whitelist, blacklist)}
              onClick={() => onEdit(c.id)}
            />
          ))
        )}
      </Card>
    </Stack>
  );
}
