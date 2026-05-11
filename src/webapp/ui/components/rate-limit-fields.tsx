import { useI18n } from "../i18n-context";
import type { RateLimitConfig } from "../../../shared/types";
import { Card } from "./layout";
import { Toggle } from "./controls";
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
        <input
          type="number"
          className={INPUT_CLS}
          value={value.capacity}
          onChange={(e) =>
            onChange({ ...value, capacity: Number(e.target.value) })
          }
        />
      </label>
      <label className={ROW_CLS}>
        <span className={ROW_LABEL_CLS}>{s.ui_ratelimit_refill_amount}</span>
        <input
          type="number"
          className={INPUT_CLS}
          value={value.refillAmount}
          onChange={(e) =>
            onChange({ ...value, refillAmount: Number(e.target.value) })
          }
        />
      </label>
      <label className={ROW_CLS}>
        <span className={ROW_LABEL_CLS}>{s.ui_ratelimit_refill_every}</span>
        <input
          type="number"
          className={INPUT_CLS}
          value={intervalMin}
          onChange={(e) =>
            onChange({
              ...value,
              refillIntervalMs: Number(e.target.value) * 60_000,
            })
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
    </Card>
  );
}
