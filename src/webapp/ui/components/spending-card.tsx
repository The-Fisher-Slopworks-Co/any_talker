// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../i18n-context";
import type { SpendSummary } from "../api-client";
import { Card, SectionFooter, SectionHeader } from "./layout";
import { ROW_CLS, ROW_LABEL_CLS, ROW_VALUE_CLS } from "./row";
import { formatUsd } from "../lib/labels";

export function SpendingCard({ spending }: { spending: SpendSummary }) {
  const { t: s } = useI18n();
  const rows: Array<[string, number]> = [
    [s.ui_spending_day, spending.day],
    [s.ui_spending_week, spending.week],
    [s.ui_spending_month, spending.month],
  ];
  return (
    <>
      <SectionHeader>{s.ui_spending_title}</SectionHeader>
      <Card>
        {rows.map(([label, amount]) => (
          <div key={label} className={ROW_CLS}>
            <span className={ROW_LABEL_CLS}>{label}</span>
            <span className={ROW_VALUE_CLS}>{formatUsd(amount)}</span>
          </div>
        ))}
      </Card>
      <SectionFooter>{s.ui_spending_footer}</SectionFooter>
    </>
  );
}
