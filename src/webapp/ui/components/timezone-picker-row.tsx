// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../i18n-context";
import { getTimezoneAreas, getTimezoneLocations } from "../timezones";
import { ValueSelectRow } from "./value-select-row";

// `<select>` values are strings, so "automatic" (null) travels as "".
const AUTO = "";

const cityName = (location: string) =>
  location.replace(/_/g, " ").replace(/\//g, " / ");

// The timezone as one pop-up row: "Automatic" first, then every zone grouped
// by area, so the closed row shows just the city.
export function TimezonePickerRow({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (tz: string | null) => void;
}) {
  const { t: s } = useI18n();
  const areas = getTimezoneAreas();
  // A stored zone outside the list (e.g. bare "UTC") still has to show.
  const known = value === null || value.includes("/");
  return (
    <ValueSelectRow
      label={s.ui_main_timezone}
      value={value ?? AUTO}
      onChange={(v) => onChange(v === AUTO ? null : v)}
    >
      <option value={AUTO}>{s.ui_main_tz_auto}</option>
      {known ? null : <option value={value}>{value}</option>}
      {areas.map((area) => (
        <optgroup key={area} label={area}>
          {getTimezoneLocations(area).map((loc) => (
            <option key={loc} value={`${area}/${loc}`}>
              {cityName(loc)}
            </option>
          ))}
        </optgroup>
      ))}
    </ValueSelectRow>
  );
}
