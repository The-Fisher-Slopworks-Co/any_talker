// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../i18n-context";
import type { Gender } from "../../../shared/types";
import { ValueSelectRow } from "./value-select-row";

// `<select>` values are strings, so "not set" (null) travels as "".
const UNSET = "";

// Gender as one pop-up row whose first choice is "not set", instead of a
// switch that reveals a second card of options.
export function GenderPickerRow({
  value,
  onChange,
}: {
  value: Gender | null;
  onChange: (g: Gender | null) => void;
}) {
  const { t: s } = useI18n();
  return (
    <ValueSelectRow
      label={s.ui_main_gender}
      value={value ?? UNSET}
      onChange={(v) => onChange(v === "male" || v === "female" ? v : null)}
    >
      <option value={UNSET}>{s.ui_main_gender_unset}</option>
      <option value="male">{s.ui_main_male}</option>
      <option value="female">{s.ui_main_female}</option>
    </ValueSelectRow>
  );
}
