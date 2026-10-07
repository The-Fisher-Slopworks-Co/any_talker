// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useState } from "react";
import { useI18n } from "../../i18n-context";
import { api } from "../../api-client";
import type { Settings, WhitelistEntry } from "../../../../shared/types";
import {
  Card,
  SectionFooter,
  SectionHeader,
  Stack,
} from "../../components/layout";
import { Avatar } from "../../components/avatar";
import { SwitchRow } from "../../components/switch-row";
import { NavRow } from "../../components/select-row";
import { SwipeToDelete } from "../../components/swipe-row";
import { SaveStatus } from "../../components/save-status";
import { LoadingState } from "../../components/states";
import { ROW_CLS } from "../../components/row";
import { useFailureToast } from "../../lib/use-failure-toast";
import { useLoadable } from "../../lib/use-loadable";

// One allow/block list section. The two lists differ only in their header and
// footer copy and in which API call removes an entry.
function EntryList({
  header,
  footer,
  entries,
  onOpen,
  onRemove,
}: {
  header: string;
  footer?: string;
  entries: WhitelistEntry[];
  onOpen: (id: string) => void;
  onRemove: (id: string) => Promise<void>;
}) {
  const { t: s } = useI18n();
  return (
    <>
      <SectionHeader>{header}</SectionHeader>
      <Card>
        {entries.length === 0 ? (
          <div className={`${ROW_CLS} text-tg-hint`}>
            {s.ui_whitelist_no_entries}
          </div>
        ) : (
          entries.map((e) => {
            const name = e.label || `id:${e.id}`;
            return (
              <SwipeToDelete
                key={e.id}
                label={s.ui_remove}
                onDelete={() => onRemove(e.id)}
              >
                <NavRow
                  avatar={<Avatar id={e.id} name={name} />}
                  title={name}
                  subtitle={`id ${e.id}`}
                  onClick={() => onOpen(e.id)}
                />
              </SwipeToDelete>
            );
          })
        )}
      </Card>
      {footer && <SectionFooter>{footer}</SectionFooter>}
    </>
  );
}

const whitelistLoads = {
  whitelist: { key: "admin-whitelist", load: () => api.getWhitelist() },
  blacklist: { key: "admin-blacklist", load: () => api.getBlacklist() },
};

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
  const { data, setData } = useLoadable(whitelistLoads.whitelist);
  const { data: blacklist, setData: setBlacklist } = useLoadable(
    whitelistLoads.blacklist,
  );
  // Optimistic local mirror so the switch flips instantly; reverted if the save
  // fails. Whitelist enforcement is a global policy — one PUT per toggle.
  const [enabled, setEnabled] = useState(settings.whitelistEnabled);
  const [saving, setSaving] = useState(false);
  // A failed change reverts on its own; this only tells the user.
  const { status, fail } = useFailureToast();
  // Rethrows, so the swiped row still slides back.
  const reportFailure =
    (remove: (id: string) => Promise<void>) => async (id: string) => {
      try {
        await remove(id);
      } catch (e) {
        fail();
        throw e;
      }
    };

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
      fail();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack>
      <div className="section-gap">
        <Card>
          <SwitchRow
            label={s.ui_whitelist_enforce}
            value={enabled}
            onChange={toggleEnforce}
          />
        </Card>
      </div>
      <SectionFooter>{s.ui_whitelist_enforce_footer}</SectionFooter>

      {data === null ? (
        <LoadingState />
      ) : (
        <>
          <EntryList
            header={s.ui_whitelist_allowed_users}
            entries={data.users}
            onOpen={onOpenUser}
            onRemove={reportFailure(async (id) => {
              const users = await api.removeWhitelist("users", id);
              setData((prev) => (prev ? { ...prev, users } : prev));
            })}
          />
          <EntryList
            header={s.ui_whitelist_allowed_chats}
            footer={s.ui_whitelist_footer}
            entries={data.chats}
            onOpen={onOpenChat}
            onRemove={reportFailure(async (id) => {
              const chats = await api.removeWhitelist("chats", id);
              setData((prev) => (prev ? { ...prev, chats } : prev));
            })}
          />
        </>
      )}

      {blacklist === null ? (
        <LoadingState />
      ) : (
        <>
          <EntryList
            header={s.ui_blacklist_blocked_users}
            footer={s.ui_blacklist_footer_users}
            entries={blacklist.users}
            onOpen={onOpenUser}
            onRemove={reportFailure(async (id) => {
              const users = await api.removeBlacklist("users", id);
              setBlacklist((prev) => (prev ? { ...prev, users } : prev));
            })}
          />
          <EntryList
            header={s.ui_blacklist_blocked_chats}
            footer={s.ui_blacklist_footer_chats}
            entries={blacklist.chats}
            onOpen={onOpenChat}
            onRemove={reportFailure(async (id) => {
              const chats = await api.removeBlacklist("chats", id);
              setBlacklist((prev) => (prev ? { ...prev, chats } : prev));
            })}
          />
        </>
      )}
      <SaveStatus status={status} />
    </Stack>
  );
}
