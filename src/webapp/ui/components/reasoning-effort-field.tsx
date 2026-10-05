// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../i18n-context";
import { REASONING_EFFORTS, type ReasoningEffort } from "../../../shared/types";
import { ValueSelectRow } from "./value-select-row";

// The "no effort sent" choice, encoded as an option value the <select> can hold.
const DEFAULT_VALUE = "";

// One picker row. A native <select> rather than a segmented
// control: the full effort ladder is seven levels plus "Default", too many to
// fit as segments on a phone. "Default" (null) sends no effort at all, leaving
// the choice to the model.
export function ReasoningEffortField({
  value,
  onChange,
}: {
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
    <ValueSelectRow
      label={s.ui_prompt_reasoning_effort}
      value={value ?? DEFAULT_VALUE}
      onChange={(v) =>
        onChange(v === DEFAULT_VALUE ? null : (v as ReasoningEffort))
      }
    >
      <option value={DEFAULT_VALUE}>{s.ui_effort_default}</option>
      {REASONING_EFFORTS.map((e) => (
        <option key={e} value={e}>
          {labels[e]}
        </option>
      ))}
    </ValueSelectRow>
  );
}
