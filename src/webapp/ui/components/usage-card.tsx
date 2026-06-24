// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../i18n-context";
import type { UsageStatus, WindowStatus } from "../../../ratelimit/window";
import { Card } from "./layout";
import { ROW_CLS, ROW_LABEL_CLS, ROW_VALUE_CLS } from "./row";

function WindowRows({ label, w }: { label: string; w: WindowStatus }) {
  const { t: s } = useI18n();
  return (
    <>
      <div className={ROW_CLS}>
        <span className={ROW_LABEL_CLS}>{label}</span>
        <span className={ROW_VALUE_CLS}>
          {w.used.toLocaleString()} / {w.limit.toLocaleString()}
        </span>
      </div>
      <div className={ROW_CLS}>
        <span className={ROW_LABEL_CLS}>{s.ui_ratelimit_resets}</span>
        <span className={ROW_VALUE_CLS}>
          {new Date(w.resetMs).toLocaleString()}
        </span>
      </div>
    </>
  );
}

// Renders both rate-limit windows (5-hour + weekly) as used / limit and reset
// time. Used by the admin "My Usage" tab and the per-user admin view.
export function UsageCard({ usage }: { usage: UsageStatus }) {
  const { t: s } = useI18n();
  return (
    <Card>
      <WindowRows label={s.ui_ratelimit_5h_window} w={usage.fiveHour} />
      <WindowRows label={s.ui_ratelimit_weekly_window} w={usage.weekly} />
    </Card>
  );
}
