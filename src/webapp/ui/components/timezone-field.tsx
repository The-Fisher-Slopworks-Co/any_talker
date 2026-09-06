// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../i18n-context";
import { SectionFooter, SectionHeader } from "./layout";
import { TimezoneSelect } from "./timezone-select";
import { ToggleRow } from "./toggle-row";

// `enabled` and `value` stay separate so switching the override off and back
// on restores the previously picked zone instead of resetting it to UTC.
export function TimezoneField({
  enabled,
  onEnabledChange,
  value,
  onChange,
}: {
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  value: string;
  onChange: (tz: string) => void;
}) {
  const { t: s } = useI18n();
  return (
    <>
      <SectionHeader>{s.ui_main_timezone}</SectionHeader>
      <ToggleRow
        label={s.ui_main_use_my_tz}
        value={enabled}
        onChange={onEnabledChange}
      />
      {enabled ? <TimezoneSelect value={value} onChange={onChange} /> : null}
      <SectionFooter>{s.ui_main_tz_footer}</SectionFooter>
    </>
  );
}
