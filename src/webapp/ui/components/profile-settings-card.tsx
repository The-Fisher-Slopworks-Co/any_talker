// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../i18n-context";
import { isValidLang, SUPPORTED_LANGS, type Lang } from "../../../shared/i18n";
import {
  DATE_FORMAT_SAMPLE_MS,
  DATE_FORMATS,
  formatDateTime,
  isValidDateFormat,
  type DateFormat,
} from "../../../shared/date-format";
import type { DisplayNameError } from "../../../shared/display-name";
import type { Gender } from "../../../shared/types";
import { DISPLAY_NAME_ERR_KEY, LANG_LABEL_KEY } from "../lib/labels";
import { Card, SectionFooter, SectionHeader } from "./layout";
import { INPUT_CLS, ROW_CLS, ROW_LABEL_CLS } from "./row";
import { GenderPickerRow } from "./gender-picker-row";
import { TimezonePickerRow } from "./timezone-picker-row";
import { ValueSelectRow } from "./value-select-row";

export type ProfileChoices = {
  dateFormat: DateFormat | null;
  language: Lang;
};

// `<select>` values are strings, so an unset (null) choice travels as "".
const UNSET = "";

// The caller's own profile, grouped the way iOS Settings would: who you are
// to the AI, then language and region. Each setting is one row showing its
// current value. Saving is the caller's concern — every pick is reported at
// once, the name only when the input is left.
export function AboutYouSection({
  name,
  namePlaceholder,
  nameError,
  onNameChange,
  onNameCommit,
  gender,
  onGender,
}: {
  name: string;
  namePlaceholder: string;
  nameError: DisplayNameError | null;
  onNameChange: (v: string) => void;
  onNameCommit: () => void;
  gender: Gender | null;
  onGender: (g: Gender | null) => void;
}) {
  const { t: s } = useI18n();
  return (
    <>
      <SectionHeader>{s.ui_main_about_you}</SectionHeader>
      <Card>
        <label className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_main_name}</span>
          <input
            className={INPUT_CLS}
            placeholder={namePlaceholder}
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            onBlur={onNameCommit}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
        </label>
        <GenderPickerRow value={gender} onChange={onGender} />
      </Card>
      <SectionFooter>
        {nameError ? (
          <span className="text-tg-destructive">
            {s[DISPLAY_NAME_ERR_KEY[nameError]]}
          </span>
        ) : (
          s.ui_main_about_footer
        )}
      </SectionFooter>
    </>
  );
}

export function LanguageRegionSection({
  choices,
  onChoice,
  timezone,
  onTimezone,
}: {
  choices: ProfileChoices;
  onChoice: (patch: Partial<ProfileChoices>) => void;
  // Also the zone the date-format samples are rendered in (null: the device's).
  timezone: string | null;
  onTimezone: (tz: string | null) => void;
}) {
  const { t: s } = useI18n();
  return (
    <>
      <SectionHeader>{s.ui_main_lang_region}</SectionHeader>
      <Card>
        <ValueSelectRow
          label={s.ui_main_language}
          value={choices.language}
          onChange={(v) => {
            if (isValidLang(v)) onChoice({ language: v });
          }}
        >
          {SUPPORTED_LANGS.map((code) => (
            <option key={code} value={code}>
              {s[LANG_LABEL_KEY[code]]}
            </option>
          ))}
        </ValueSelectRow>
        <TimezonePickerRow value={timezone} onChange={onTimezone} />
        <ValueSelectRow
          label={s.ui_main_time_format}
          value={choices.dateFormat ?? UNSET}
          onChange={(v) =>
            onChoice({ dateFormat: isValidDateFormat(v) ? v : null })
          }
        >
          <option value={UNSET}>{s.ui_main_time_format_auto}</option>
          {DATE_FORMATS.map((fmt) => (
            <option key={fmt} value={fmt}>
              {formatDateTime(DATE_FORMAT_SAMPLE_MS, fmt, timezone)}
            </option>
          ))}
        </ValueSelectRow>
      </Card>
      <SectionFooter>{s.ui_main_region_footer}</SectionFooter>
    </>
  );
}
