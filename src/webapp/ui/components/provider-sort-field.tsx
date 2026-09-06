// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../i18n-context";
import { SegmentedField } from "./segmented-field";
import type { ProviderSort } from "../../../shared/types";

export function ProviderSortField({
  value,
  onChange,
}: {
  value: ProviderSort | null;
  onChange: (next: ProviderSort | null) => void;
}) {
  const { t: s } = useI18n();
  const options: { value: ProviderSort | null; label: string }[] = [
    { value: null, label: s.ui_sort_default },
    { value: "price", label: s.ui_sort_price },
    { value: "throughput", label: s.ui_sort_throughput },
    { value: "latency", label: s.ui_sort_latency },
  ];
  return <SegmentedField value={value} options={options} onChange={onChange} />;
}
