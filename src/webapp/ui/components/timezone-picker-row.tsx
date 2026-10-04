// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../i18n-context";
import { getTimezoneAreas, getTimezoneLocations } from "../timezones";
import { ValueSelectRow } from "./value-select-row";

// `<select>` values are strings, so "automatic" (null) travels as "".
const AUTO = "";

const cityName = (location: string) =>
  location.replace(/_/g, " ").replace(/\//g, " / ");

// The timezone as one pop-up row: the empty choice first, then every zone
// grouped by area, so the closed row shows just the city. The empty choice is
// "Automatic" unless the caller names what null falls back to (e.g. "Global
// (UTC)"); `emptyLabel: null` drops it for a zone that must be set.
export function TimezonePickerRow({
  value,
  onChange,
  emptyLabel,
}: {
  value: string | null;
  onChange: (tz: string | null) => void;
  emptyLabel?: string | null;
}) {
  const { t: s } = useI18n();
  const empty = emptyLabel === undefined ? s.ui_main_tz_auto : emptyLabel;
  const areas = getTimezoneAreas();
  // A stored zone outside the list (e.g. bare "UTC") still has to show.
  const known = value === null || value.includes("/");
  return (
    <ValueSelectRow
      label={s.ui_main_timezone}
      value={value ?? AUTO}
      onChange={(v) => onChange(v === AUTO ? null : v)}
    >
      {empty === null ? null : <option value={AUTO}>{empty}</option>}
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
