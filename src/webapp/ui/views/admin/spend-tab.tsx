// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { ReactNode } from "react";
import { useI18n } from "../../i18n-context";
import { api } from "../../api-client";
import { Card, SectionHeader, Stack } from "../../components/layout";
import { EmptyState, LoadingState } from "../../components/states";
import { SpendingCard } from "../../components/spending-card";
import { ROW_CLS, ROW_VALUE_CLS } from "../../components/row";
import { formatUsd } from "../../lib/labels";
import { useLoadable } from "../../lib/use-loadable";

function ListCard({
  header,
  empty,
  rows,
}: {
  header: string;
  empty: string;
  rows: Array<{ key: string; label: ReactNode; value: ReactNode }>;
}) {
  return (
    <>
      <SectionHeader>{header}</SectionHeader>
      <Card>
        {rows.length === 0 ? (
          <EmptyState>{empty}</EmptyState>
        ) : (
          rows.map((r) => (
            <div key={r.key} className={ROW_CLS}>
              <span className="flex-1 min-w-0 truncate">{r.label}</span>
              <span className={`${ROW_VALUE_CLS} shrink-0 tabular-nums`}>
                {r.value}
              </span>
            </div>
          ))
        )}
      </Card>
    </>
  );
}

export function SpendTab() {
  const { t: s } = useI18n();
  const { data } = useLoadable(() => api.getSpendOverview(), []);
  if (data === null) return <LoadingState />;

  const spendValue = (day: number, month: number): ReactNode => (
    <>
      {formatUsd(month)}{" "}
      <span className="text-tg-hint">({formatUsd(day)}/d)</span>
    </>
  );

  return (
    <Stack>
      <SectionHeader>{s.ui_spend_global_header}</SectionHeader>
      <SpendingCard spending={data.global} />

      <ListCard
        header={s.ui_spend_top_users}
        empty={s.ui_spend_empty}
        rows={data.topUsers.map((r) => ({
          key: r.id,
          label: r.label,
          value: spendValue(r.spend.day, r.spend.month),
        }))}
      />
      <ListCard
        header={s.ui_spend_top_chats}
        empty={s.ui_spend_empty}
        rows={data.topChats.map((r) => ({
          key: r.id,
          label: r.label,
          value: spendValue(r.spend.day, r.spend.month),
        }))}
      />
      <ListCard
        header={s.ui_spend_models}
        empty={s.ui_spend_empty}
        rows={data.models.map((m) => ({
          key: m.modelId,
          label: (
            <>
              {m.modelId}
              {m.unpriced ? (
                <span className="ml-1 text-tg-hint">({s.ui_spend_unpriced})</span>
              ) : null}
            </>
          ),
          value: formatUsd(m.spend.month),
        }))}
      />
      <ListCard
        header={s.ui_spend_denials}
        empty={s.ui_spend_empty}
        rows={data.topDenied.map((d) => ({
          key: d.userId,
          label: d.label,
          value: d.count,
        }))}
      />
      <ListCard
        header={s.ui_spend_new_users}
        empty={s.ui_spend_empty}
        rows={data.newUsers.map((u) => ({
          key: u.id,
          label: u.label,
          value: "",
        }))}
      />
      <ListCard
        header={s.ui_spend_new_chats}
        empty={s.ui_spend_empty}
        rows={data.newChats.map((c) => ({
          key: c.id,
          label: c.label,
          value: c.type,
        }))}
      />
    </Stack>
  );
}
