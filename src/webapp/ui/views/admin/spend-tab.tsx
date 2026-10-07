// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../../i18n-context";
import { api, type SpendOverview } from "../../api-client";
import { Card, SectionHeader, Stack } from "../../components/layout";
import { ROW_CLS } from "../../components/row";
import { NavRow } from "../../components/select-row";
import { SpendingCard } from "../../components/spending-card";
import { LoadingState } from "../../components/states";
import { chatTypeLabel, formatUsd } from "../../lib/labels";
import { useLoadable } from "../../lib/use-loadable";

type Row = {
  key: string;
  title: string;
  subtitle?: string;
  value?: string;
  // Rows that lead to a page; the rest (models) are plain.
  onClick?: () => void;
};

function PlainRow({ title, subtitle, value }: Omit<Row, "key" | "onClick">) {
  return (
    <div className={ROW_CLS}>
      <div className="flex-1 min-w-0">
        <div className="truncate">{title}</div>
        {subtitle ? (
          <div className="text-[13px] text-tg-hint truncate">{subtitle}</div>
        ) : null}
      </div>
      {value ? (
        <span className="shrink-0 text-tg-hint tabular-nums">{value}</span>
      ) : null}
    </div>
  );
}

function ListCard({ header, rows }: { header: string; rows: Row[] }) {
  const { t: s } = useI18n();
  return (
    <>
      <SectionHeader>{header}</SectionHeader>
      <Card>
        {rows.length === 0 ? (
          <div className={`${ROW_CLS} text-tg-hint`}>{s.ui_spend_empty}</div>
        ) : (
          rows.map(({ key, onClick, ...row }) =>
            onClick ? (
              <NavRow key={key} {...row} onClick={onClick} />
            ) : (
              <PlainRow key={key} {...row} />
            ),
          )
        )}
      </Card>
    </>
  );
}

// "anthropic/claude-sonnet-5" → the model on top, its provider underneath.
function splitModelId(id: string): { name: string; provider?: string } {
  const slash = id.indexOf("/");
  return slash < 0
    ? { name: id }
    : { name: id.slice(slash + 1), provider: id.slice(0, slash) };
}

export function SpendOverviewView({
  data,
  onEditUser,
  onEditChat,
}: {
  data: SpendOverview;
  onEditUser: (id: string) => void;
  onEditChat: (id: string) => void;
}) {
  const { t: s } = useI18n();
  const spendRow =
    (open: (id: string) => void) =>
    (r: SpendOverview["topUsers"][number]): Row => ({
      key: r.id,
      title: r.label,
      subtitle: s.ui_spend_today(formatUsd(r.spend.day)),
      value: formatUsd(r.spend.month),
      onClick: () => open(r.id),
    });

  return (
    <Stack>
      <SpendingCard spending={data.global} header={s.ui_spend_global_header} />

      <ListCard
        header={s.ui_spend_top_users}
        rows={data.topUsers.map(spendRow(onEditUser))}
      />
      <ListCard
        header={s.ui_spend_top_chats}
        rows={data.topChats.map(spendRow(onEditChat))}
      />
      <ListCard
        header={s.ui_spend_models}
        rows={data.models.map((m) => {
          const { name, provider } = splitModelId(m.modelId);
          return {
            key: m.modelId,
            title: name,
            subtitle: [provider, m.unpriced ? s.ui_spend_unpriced : null]
              .filter(Boolean)
              .join(" · "),
            value: formatUsd(m.spend.month),
          };
        })}
      />
      <ListCard
        header={s.ui_spend_denials}
        rows={data.topDenied.map((d) => ({
          key: d.userId,
          title: d.label,
          value: String(d.count),
          onClick: () => onEditUser(d.userId),
        }))}
      />
      <ListCard
        header={s.ui_spend_new_users}
        rows={data.newUsers.map((u) => ({
          key: u.id,
          title: u.label,
          onClick: () => onEditUser(u.id),
        }))}
      />
      <ListCard
        header={s.ui_spend_new_chats}
        rows={data.newChats.map((c) => ({
          key: c.id,
          title: c.label,
          value: chatTypeLabel(s, c.type),
          onClick: () => onEditChat(c.id),
        }))}
      />
    </Stack>
  );
}

export const spendLoad = {
  key: "admin-spend",
  load: () => api.getSpendOverview(),
};

export function SpendTab({
  onEditUser,
  onEditChat,
}: {
  onEditUser: (id: string) => void;
  onEditChat: (id: string) => void;
}) {
  const { data } = useLoadable(spendLoad);
  if (data === null) return <LoadingState />;
  return (
    <SpendOverviewView
      data={data}
      onEditUser={onEditUser}
      onEditChat={onEditChat}
    />
  );
}
