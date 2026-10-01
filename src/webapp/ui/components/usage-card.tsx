// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../i18n-context";
import { useDateFmt } from "../datetime-context";
import type { UsageStatus, WindowStatus } from "../../../ratelimit/window";
import { Card } from "./layout";
import { ROW_CLS, ROW_LABEL_CLS, ROW_VALUE_CLS } from "./row";

// Window amounts are fractions of a cent apart, so keep four decimals.
function formatUsd(n: number): string {
  return `$${n.toFixed(4)}`;
}

// Share of the window's budget spent. Rounds like `ratelimit/share.ts` (any
// spend shows as at least 1%) but is not capped at 100, so an overrun stays
// visible to the admin.
export function formatUsedPercent(w: WindowStatus): string {
  if (w.limit <= 0) return "100%";
  const raw = (w.used / w.limit) * 100;
  const rounded = raw > 0 && raw < 1 ? 1 : Math.round(raw);
  return `${Math.max(0, rounded)}%`;
}

function WindowRows({
  label,
  w,
  percent,
}: {
  label: string;
  w: WindowStatus;
  percent: boolean;
}) {
  const { t: s } = useI18n();
  const { format } = useDateFmt();
  return (
    <>
      <div className={ROW_CLS}>
        <span className={ROW_LABEL_CLS}>{label}</span>
        <span className={ROW_VALUE_CLS}>
          {percent
            ? formatUsedPercent(w)
            : `${formatUsd(w.used)} / ${formatUsd(w.limit)}`}
        </span>
      </div>
      <div className={ROW_CLS}>
        <span className={ROW_LABEL_CLS}>{s.ui_ratelimit_resets}</span>
        <span className={ROW_VALUE_CLS}>{format(w.resetMs)}</span>
      </div>
    </>
  );
}

// Renders both rate-limit windows (5-hour + weekly) with their reset times —
// as used / limit in USD (admin "My Usage" tab) or, with `percent`, as the
// share of the limit spent (per-user admin view).
export function UsageCard({
  usage,
  percent = false,
}: {
  usage: UsageStatus;
  percent?: boolean;
}) {
  const { t: s } = useI18n();
  return (
    <Card>
      <WindowRows
        label={s.ui_ratelimit_5h_window}
        w={usage.fiveHour}
        percent={percent}
      />
      <WindowRows
        label={s.ui_ratelimit_weekly_window}
        w={usage.weekly}
        percent={percent}
      />
    </Card>
  );
}
