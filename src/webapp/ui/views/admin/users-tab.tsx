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
import { SELECTABLE_ROW_CLS } from "../../components/row";
import { formatUsd, userDisplayName } from "../../lib/labels";
import { useLoadable } from "../../lib/use-loadable";

export function UsersTab({ onEdit }: { onEdit: (id: string) => void }) {
  const { t: s } = useI18n();
  const { data } = useLoadable(() => api.listAdminUsers(), []);

  if (data === null) return <LoadingState />;
  const { users, displayNames, spending } = data;

  return (
    <Stack>
      <SectionHeader>{s.ui_users_all}</SectionHeader>
      <Card>
        {users.length === 0 ? (
          <EmptyState>{s.ui_users_empty}</EmptyState>
        ) : (
          users.map((u) => (
            <button
              key={u.id}
              type="button"
              className={SELECTABLE_ROW_CLS}
              onClick={() => onEdit(u.id)}
            >
              <div className="flex-1 min-w-0">
                <div className="truncate">
                  {userDisplayName(u, displayNames[u.id])}
                </div>
                <div className="text-[13px] text-tg-hint truncate">
                  {u.username ? `@${u.username}` : `id ${u.id}`}
                </div>
              </div>
              <span className="shrink-0 text-[13px] text-tg-hint tabular-nums">
                {s.ui_spending_month_short(
                  formatUsd(spending[u.id]?.month ?? 0),
                )}
              </span>
              <span className="shrink-0 text-tg-hint text-[15px]">›</span>
            </button>
          ))
        )}
      </Card>
      <SectionFooter>{s.ui_users_footer}</SectionFooter>
    </Stack>
  );
}
