// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../i18n-context";
import { SUPPORTED_LANGS, type Lang } from "../../../shared/i18n";
import { Card, SectionFooter, SectionHeader } from "./layout";
import { SelectRow } from "./select-row";
import { ToggleRow } from "./toggle-row";
import { LANG_LABEL_KEY } from "../lib/labels";

// Own settings always resolve to some language, so there the list is always
// shown. Editing somebody else's, a language may also be unset, so pass
// `toggle` to gate the list behind an override switch.
export function LanguageField({
  value,
  onChange,
  toggle,
}: {
  value: Lang;
  onChange: (lang: Lang) => void;
  toggle?: { enabled: boolean; onEnabledChange: (v: boolean) => void };
}) {
  const { t: s } = useI18n();
  const options = (
    <Card>
      {SUPPORTED_LANGS.map((code) => (
        <SelectRow
          key={code}
          label={s[LANG_LABEL_KEY[code]]}
          selected={value === code}
          onSelect={() => onChange(code)}
        />
      ))}
    </Card>
  );
  return (
    <>
      <SectionHeader>{s.ui_main_language}</SectionHeader>
      {toggle ? (
        <>
          <ToggleRow
            label={s.ui_user_set_language}
            value={toggle.enabled}
            onChange={toggle.onEnabledChange}
          />
          {toggle.enabled ? options : null}
        </>
      ) : (
        options
      )}
      <SectionFooter>{s.ui_main_language_footer}</SectionFooter>
    </>
  );
}
