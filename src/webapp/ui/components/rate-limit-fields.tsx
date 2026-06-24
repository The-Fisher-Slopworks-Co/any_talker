// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../i18n-context";
import type { RateLimitConfig } from "../../../shared/types";
import { Card } from "./layout";
import { NumberInput, Toggle } from "./controls";
import { INPUT_CLS, ROW_CLS, ROW_LABEL_CLS } from "./row";

export function RateLimitFields({
  value,
  onChange,
}: {
  value: RateLimitConfig;
  onChange: (next: RateLimitConfig) => void;
}) {
  const { t: s } = useI18n();
  return (
    <Card>
      <label className={ROW_CLS}>
        <span className={ROW_LABEL_CLS}>{s.ui_ratelimit_5h_tokens}</span>
        <NumberInput
          className={INPUT_CLS}
          integer
          min={0}
          value={value.fiveHourTokens}
          onChange={(n) => onChange({ ...value, fiveHourTokens: n })}
        />
      </label>
      <label className={ROW_CLS}>
        <span className={ROW_LABEL_CLS}>{s.ui_ratelimit_weekly_tokens}</span>
        <NumberInput
          className={INPUT_CLS}
          integer
          min={0}
          value={value.weeklyTokens}
          onChange={(n) => onChange({ ...value, weeklyTokens: n })}
        />
      </label>
      <div className={ROW_CLS}>
        <span className={ROW_LABEL_CLS}>{s.ui_ratelimit_owner_exempt}</span>
        <span className="flex-1" />
        <Toggle
          value={value.ownerExempt}
          onChange={(v) => onChange({ ...value, ownerExempt: v })}
        />
      </div>
      <label className={ROW_CLS}>
        <span className={ROW_LABEL_CLS}>
          {s.ui_ratelimit_wise_multiplier}
        </span>
        <NumberInput
          className={INPUT_CLS}
          step="0.1"
          min={1}
          value={value.wiseMultiplier}
          onChange={(n) => onChange({ ...value, wiseMultiplier: n })}
        />
      </label>
    </Card>
  );
}
