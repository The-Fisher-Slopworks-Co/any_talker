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
  const intervalMin = Math.round(value.refillIntervalMs / 60000);
  return (
    <Card>
      <label className={ROW_CLS}>
        <span className={ROW_LABEL_CLS}>{s.ui_ratelimit_capacity}</span>
        <NumberInput
          className={INPUT_CLS}
          integer
          min={0}
          value={value.capacity}
          onChange={(n) => onChange({ ...value, capacity: n })}
        />
      </label>
      <label className={ROW_CLS}>
        <span className={ROW_LABEL_CLS}>{s.ui_ratelimit_refill_amount}</span>
        <NumberInput
          className={INPUT_CLS}
          integer
          min={0}
          value={value.refillAmount}
          onChange={(n) => onChange({ ...value, refillAmount: n })}
        />
      </label>
      <label className={ROW_CLS}>
        <span className={ROW_LABEL_CLS}>{s.ui_ratelimit_refill_every}</span>
        <NumberInput
          className={INPUT_CLS}
          integer
          min={0}
          value={intervalMin}
          onChange={(n) =>
            onChange({ ...value, refillIntervalMs: n * 60_000 })
          }
        />
        <span className="shrink-0 text-tg-hint text-[15px]">
          {s.ui_ratelimit_min_unit}
        </span>
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
          {s.ui_ratelimit_detailed_multiplier}
        </span>
        <NumberInput
          className={INPUT_CLS}
          step="0.1"
          min={0}
          value={value.detailedMultiplier}
          onChange={(n) => onChange({ ...value, detailedMultiplier: n })}
        />
      </label>
      <label className={ROW_CLS}>
        <span className={ROW_LABEL_CLS}>
          {s.ui_ratelimit_wise_multiplier}
        </span>
        <NumberInput
          className={INPUT_CLS}
          step="0.1"
          min={0}
          value={value.wiseMultiplier}
          onChange={(n) => onChange({ ...value, wiseMultiplier: n })}
        />
      </label>
    </Card>
  );
}
