// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../i18n-context";
import { SegmentedField } from "./segmented-field";
import type { ReasoningEffort } from "../../../shared/types";

// One labelled segmented control per detail level. "Default" (null) sends no
// effort at all, leaving the choice to the model.
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
  const options: { value: ReasoningEffort | null; label: string }[] = [
    { value: null, label: s.ui_effort_default },
    { value: "minimal", label: s.ui_effort_minimal },
    { value: "low", label: s.ui_effort_low },
    { value: "medium", label: s.ui_effort_medium },
    { value: "high", label: s.ui_effort_high },
  ];
  return (
    <div className="row relative flex flex-col gap-2 px-4 py-[11px]">
      <span className="text-base">{label}</span>
      <SegmentedField value={value} options={options} onChange={onChange} />
    </div>
  );
}
