// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../i18n-context";
import { REASONING_EFFORTS, type ReasoningEffort } from "../../../shared/types";
import { SelectChevron } from "./controls";
import { INPUT_CLS, ROW_CLS, ROW_LABEL_CLS } from "./row";

// The "no effort sent" choice, encoded as an option value the <select> can hold.
const DEFAULT_VALUE = "";

// One labelled row per detail level. A native <select> rather than a segmented
// control: the full effort ladder is seven levels plus "Default", too many to
// fit as segments on a phone. "Default" (null) sends no effort at all, leaving
// the choice to the model.
export function ReasoningEffortField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ReasoningEffort | null;
  onChange: (next: ReasoningEffort | null) => void;
}) {
  const { t: s } = useI18n();
  const labels: Record<ReasoningEffort, string> = {
    none: s.ui_effort_none,
    minimal: s.ui_effort_minimal,
    low: s.ui_effort_low,
    medium: s.ui_effort_medium,
    high: s.ui_effort_high,
    xhigh: s.ui_effort_xhigh,
    max: s.ui_effort_max,
  };
  return (
    <label className={ROW_CLS}>
      <span className={ROW_LABEL_CLS}>{label}</span>
      <span className="relative flex flex-1 min-w-0 items-center">
        <select
          className={`${INPUT_CLS} w-full pr-5`}
          value={value ?? DEFAULT_VALUE}
          onChange={(e) =>
            onChange(
              e.target.value === DEFAULT_VALUE
                ? null
                : (e.target.value as ReasoningEffort),
            )
          }
        >
          <option value={DEFAULT_VALUE}>{s.ui_effort_default}</option>
          {REASONING_EFFORTS.map((e) => (
            <option key={e} value={e}>
              {labels[e]}
            </option>
          ))}
        </select>
        <SelectChevron />
      </span>
    </label>
  );
}
