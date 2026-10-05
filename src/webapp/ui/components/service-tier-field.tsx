// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../i18n-context";
import { ValueSelectRow } from "./value-select-row";
import type { ServiceTier } from "../../../shared/types";

// `<select>` values are strings, so "no tier" (null) travels as "".
const DEFAULT_VALUE = "";

const TIERS: ServiceTier[] = ["flex", "priority"];

// A picker row, to sit in a card with its siblings.
export function ServiceTierField({
  value,
  onChange,
}: {
  value: ServiceTier | null;
  onChange: (next: ServiceTier | null) => void;
}) {
  const { t: s } = useI18n();
  const labels: Record<ServiceTier, string> = {
    flex: s.ui_tier_flex,
    priority: s.ui_tier_priority,
  };
  return (
    <ValueSelectRow
      label={s.ui_prompt_service_tier}
      value={value ?? DEFAULT_VALUE}
      onChange={(v) =>
        onChange(v === DEFAULT_VALUE ? null : (v as ServiceTier))
      }
    >
      <option value={DEFAULT_VALUE}>{s.ui_tier_default}</option>
      {TIERS.map((o) => (
        <option key={o} value={o}>
          {labels[o]}
        </option>
      ))}
    </ValueSelectRow>
  );
}
