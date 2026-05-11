// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../../i18n-context";
import { api } from "../../api-client";
import type {
  WhitelistEntry,
  WhitelistKind,
} from "../../../../shared/types";
import {
  Card,
  SectionFooter,
  SectionHeader,
  Stack,
} from "../../components/layout";
import { EmptyState, LoadingState } from "../../components/states";
import { ROW_CLS } from "../../components/row";
import { useLoadable } from "../../lib/use-loadable";

function WhitelistList({
  kind,
  entries,
  onOpen,
  onRemove,
}: {
  kind: WhitelistKind;
  entries: WhitelistEntry[];
  onOpen: (id: string) => void;
  onRemove: (id: string) => Promise<void>;
}) {
  const { t: s } = useI18n();
  return (
    <>
      <SectionHeader>
        {kind === "users"
          ? s.ui_whitelist_allowed_users
          : s.ui_whitelist_allowed_chats}
      </SectionHeader>
      <Card>
        {entries.length === 0 ? (
          <EmptyState>{s.ui_whitelist_no_entries}</EmptyState>
        ) : (
          entries.map((e) => (
            <div key={e.id} className={ROW_CLS}>
              <div className="flex-1 min-w-0">
                <div className="truncate">{e.label || `id:${e.id}`}</div>
                <div className="text-[13px] text-tg-hint truncate">
                  id {e.id}
                </div>
              </div>
              <button
                className="bg-transparent border-0 px-2 py-1.5 text-[15px] text-tg-link cursor-pointer"
                onClick={() => onOpen(e.id)}
              >
                {s.ui_open}
              </button>
              <button
                className="bg-transparent border-0 px-2 py-1.5 text-[15px] text-tg-destructive cursor-pointer"
                onClick={() => onRemove(e.id)}
              >
                {s.ui_remove}
              </button>
            </div>
          ))
        )}
      </Card>
      <SectionFooter>
        {kind === "users"
          ? s.ui_whitelist_footer_users
          : s.ui_whitelist_footer_chats}
      </SectionFooter>
    </>
  );
}

export function WhitelistTab({
  onOpenUser,
  onOpenChat,
}: {
  onOpenUser: (id: string) => void;
  onOpenChat: (id: string) => void;
}) {
  const { data, setData } = useLoadable(() => api.getWhitelist(), []);

  if (data === null) return <LoadingState />;

  return (
    <Stack>
      <WhitelistList
        kind="users"
        entries={data.users}
        onOpen={onOpenUser}
        onRemove={async (id) => {
          const users = await api.removeWhitelist("users", id);
          setData((prev) => (prev ? { ...prev, users } : prev));
        }}
      />
      <WhitelistList
        kind="chats"
        entries={data.chats}
        onOpen={onOpenChat}
        onRemove={async (id) => {
          const chats = await api.removeWhitelist("chats", id);
          setData((prev) => (prev ? { ...prev, chats } : prev));
        }}
      />
    </Stack>
  );
}
