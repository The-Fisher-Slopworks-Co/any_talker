// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../../i18n-context";
import { api } from "../../api-client";
import { Card, SectionHeader, Stack } from "../../components/layout";
import { Avatar } from "../../components/avatar";
import { EmptyState, LoadingState } from "../../components/states";
import { NavRow } from "../../components/select-row";
import { formatUsd, userDisplayName } from "../../lib/labels";
import { useLoadable } from "../../lib/use-loadable";

export function UsersTab({ onEdit }: { onEdit: (id: string) => void }) {
  const { t: s } = useI18n();
  const { data } = useLoadable(() => api.listAdminUsers(), []);

  if (data === null) return <LoadingState />;
  const { users, displayNames, spending, limitClasses } = data;
  const classed = users.filter((u) => limitClasses[u.id] !== undefined);

  return (
    <Stack>
      {classed.length > 0 ? (
        <>
          <SectionHeader>{s.ui_limit_classes_header}</SectionHeader>
          <Card>
            {classed.map((u) => {
              const name = userDisplayName(u, displayNames[u.id]);
              return (
                <NavRow
                  key={u.id}
                  avatar={<Avatar id={u.id} name={name} />}
                  title={name}
                  value={s.ui_limit_class_name(limitClasses[u.id]!)}
                  onClick={() => onEdit(u.id)}
                />
              );
            })}
          </Card>
        </>
      ) : null}

      <SectionHeader>{s.ui_users_all}</SectionHeader>
      <Card>
        {users.length === 0 ? (
          <EmptyState>{s.ui_users_empty}</EmptyState>
        ) : (
          users.map((u) => {
            const name = userDisplayName(u, displayNames[u.id]);
            return (
              <NavRow
                key={u.id}
                avatar={<Avatar id={u.id} name={name} />}
                title={name}
                subtitle={u.username ? `@${u.username}` : `id ${u.id}`}
                value={formatUsd(spending[u.id]?.month ?? 0)}
                onClick={() => onEdit(u.id)}
              />
            );
          })
        )}
      </Card>
    </Stack>
  );
}
