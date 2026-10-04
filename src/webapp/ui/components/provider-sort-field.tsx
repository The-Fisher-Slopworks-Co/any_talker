// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../i18n-context";
import { ValueSelectRow } from "./value-select-row";
import type { ProviderSort } from "../../../shared/types";

// `<select>` values are strings, so "no sort" (null) travels as "".
const DEFAULT_VALUE = "";

const SORTS: ProviderSort[] = ["price", "throughput", "latency"];

// A picker row, to sit in a card with its siblings.
export function ProviderSortField({
  value,
  onChange,
}: {
  value: ProviderSort | null;
  onChange: (next: ProviderSort | null) => void;
}) {
  const { t: s } = useI18n();
  const labels: Record<ProviderSort, string> = {
    price: s.ui_sort_price,
    throughput: s.ui_sort_throughput,
    latency: s.ui_sort_latency,
  };
  return (
    <ValueSelectRow
      label={s.ui_sort_label}
      value={value ?? DEFAULT_VALUE}
      onChange={(v) =>
        onChange(v === DEFAULT_VALUE ? null : (v as ProviderSort))
      }
    >
      <option value={DEFAULT_VALUE}>{s.ui_sort_default}</option>
      {SORTS.map((o) => (
        <option key={o} value={o}>
          {labels[o]}
        </option>
      ))}
    </ValueSelectRow>
  );
}
