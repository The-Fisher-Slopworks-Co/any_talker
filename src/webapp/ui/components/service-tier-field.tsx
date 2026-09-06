// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../i18n-context";
import { SegmentedField } from "./segmented-field";
import type { ServiceTier } from "../../../shared/types";

export function ServiceTierField({
  value,
  onChange,
}: {
  value: ServiceTier | null;
  onChange: (next: ServiceTier | null) => void;
}) {
  const { t: s } = useI18n();
  const options: { value: ServiceTier | null; label: string }[] = [
    { value: null, label: s.ui_tier_default },
    { value: "flex", label: s.ui_tier_flex },
    { value: "priority", label: s.ui_tier_priority },
  ];
  return <SegmentedField value={value} options={options} onChange={onChange} />;
}
