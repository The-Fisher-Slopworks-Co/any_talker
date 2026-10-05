// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../i18n-context";
import type { RateLimitConfig } from "../../../shared/types";
import type { SettingsPatch } from "../api-client/settings";
import { Card } from "./layout";
import { NumberRow } from "./number-row";
import { SwitchRow } from "./switch-row";

// The per-user spend budgets and the owner's exemption; each edit saves at once.
export function RateLimitFields({
  value,
  save,
}: {
  value: RateLimitConfig;
  save: (patch: SettingsPatch) => void;
}) {
  const { t: s } = useI18n();
  return (
    <Card>
      <NumberRow
        label={s.ui_ratelimit_5h_usd}
        prefix="$"
        step="0.005"
        min={0}
        value={value.fiveHourUsd}
        onCommit={(fiveHourUsd) => save({ rateLimit: { fiveHourUsd } })}
      />
      <NumberRow
        label={s.ui_ratelimit_weekly_usd}
        prefix="$"
        step="0.025"
        min={0}
        value={value.weeklyUsd}
        onCommit={(weeklyUsd) => save({ rateLimit: { weeklyUsd } })}
      />
      <SwitchRow
        label={s.ui_ratelimit_owner_exempt}
        value={value.ownerExempt}
        onChange={(ownerExempt) => save({ rateLimit: { ownerExempt } })}
      />
    </Card>
  );
}
