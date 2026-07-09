// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useState } from "react";
import { useI18n } from "../../i18n-context";
import { api } from "../../api-client";
import type {
  Settings,
  WhitelistEntry,
  WhitelistKind,
} from "../../../../shared/types";
import {
  Card,
  SectionFooter,
  SectionHeader,
  Stack,
} from "../../components/layout";
import { Toggle } from "../../components/controls";
import { EmptyState, LoadingState } from "../../components/states";
import { ROW_CLS, ROW_LABEL_CLS } from "../../components/row";
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
            <div
              key={e.id}
              className={`${ROW_CLS} cursor-pointer active:bg-[var(--tg-separator)]`}
              onClick={() => onOpen(e.id)}
            >
              <div className="flex-1 min-w-0">
                <div className="truncate">{e.label || `id:${e.id}`}</div>
                <div className="text-[13px] text-tg-hint truncate">
                  id {e.id}
                </div>
              </div>
              <button
                className="bg-transparent border-0 px-2 py-1.5 text-[15px] text-tg-destructive cursor-pointer"
                onClick={(ev) => {
                  ev.stopPropagation();
                  onRemove(e.id);
                }}
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
  settings,
  onSaved,
  onOpenUser,
  onOpenChat,
}: {
  settings: Settings;
  onSaved: (s: Settings) => void;
  onOpenUser: (id: string) => void;
  onOpenChat: (id: string) => void;
}) {
  const { t: s } = useI18n();
  const { data, setData } = useLoadable(() => api.getWhitelist(), []);
  // Optimistic local mirror so the switch flips instantly; reverted if the save
  // fails. Whitelist enforcement is a global policy — one PUT per toggle.
  const [enabled, setEnabled] = useState(settings.whitelistEnabled);
  const [saving, setSaving] = useState(false);

  const toggleEnforce = async (v: boolean) => {
    if (saving) return;
    setEnabled(v);
    setSaving(true);
    try {
      const next = await api.putSettings({ whitelistEnabled: v });
      onSaved(next);
      setEnabled(next.whitelistEnabled);
    } catch {
      setEnabled(!v);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack>
      <SectionHeader>{s.ui_whitelist_enforce}</SectionHeader>
      <Card>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_whitelist_enforce}</span>
          <span className="flex-1" />
          <Toggle value={enabled} onChange={toggleEnforce} />
        </div>
      </Card>
      <SectionFooter>{s.ui_whitelist_enforce_footer}</SectionFooter>

      {data === null ? (
        <LoadingState />
      ) : (
        <>
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
        </>
      )}
    </Stack>
  );
}
