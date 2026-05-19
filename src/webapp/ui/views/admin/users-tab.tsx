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
import { ROW_CLS } from "../../components/row";
import { userDisplayName } from "../../lib/labels";
import { openTelegramProfile } from "../../lib/telegram";
import { useLoadable } from "../../lib/use-loadable";

export function UsersTab({ onEdit }: { onEdit: (id: string) => void }) {
  const { t: s } = useI18n();
  const { data } = useLoadable(() => api.listAdminUsers(), []);

  if (data === null) return <LoadingState />;
  const { users, displayNames } = data;

  return (
    <Stack>
      <SectionHeader>{s.ui_users_all}</SectionHeader>
      <Card>
        {users.length === 0 ? (
          <EmptyState>{s.ui_users_empty}</EmptyState>
        ) : (
          users.map((u) => (
            <div key={u.id} className={ROW_CLS}>
              <div className="flex-1 min-w-0">
                <div className="truncate">
                  {userDisplayName(u, displayNames[u.id])}
                </div>
                <div className="text-[13px] text-tg-hint truncate">
                  {u.username ? `@${u.username}` : `id ${u.id}`}
                </div>
              </div>
              <button
                className="bg-transparent border-0 px-2 py-1.5 text-[15px] text-tg-link cursor-pointer"
                onClick={() => openTelegramProfile(u)}
              >
                {s.ui_open}
              </button>
              <button
                className="bg-transparent border-0 px-2 py-1.5 text-[15px] text-tg-link cursor-pointer"
                onClick={() => onEdit(u.id)}
              >
                {s.ui_edit}
              </button>
            </div>
          ))
        )}
      </Card>
      <SectionFooter>{s.ui_users_footer}</SectionFooter>
    </Stack>
  );
}
