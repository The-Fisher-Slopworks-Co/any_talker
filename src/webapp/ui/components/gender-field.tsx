// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../i18n-context";
import type { Gender } from "../../../shared/types";
import { Card, SectionFooter, SectionHeader } from "./layout";
import { SelectRow } from "./select-row";
import { ToggleRow } from "./toggle-row";

// `enabled` and `value` stay separate so switching the override off and back
// on restores the previously picked gender instead of resetting it.
export function GenderField({
  enabled,
  onEnabledChange,
  value,
  onChange,
}: {
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  value: Gender;
  onChange: (g: Gender) => void;
}) {
  const { t: s } = useI18n();
  return (
    <>
      <SectionHeader>{s.ui_main_gender}</SectionHeader>
      <ToggleRow
        label={s.ui_main_tell_ai}
        value={enabled}
        onChange={onEnabledChange}
      />
      {enabled ? (
        <Card>
          <SelectRow
            label={s.ui_main_male}
            selected={value === "male"}
            onSelect={() => onChange("male")}
          />
          <SelectRow
            label={s.ui_main_female}
            selected={value === "female"}
            onSelect={() => onChange("female")}
          />
        </Card>
      ) : null}
      <SectionFooter>{s.ui_main_gender_footer}</SectionFooter>
    </>
  );
}
