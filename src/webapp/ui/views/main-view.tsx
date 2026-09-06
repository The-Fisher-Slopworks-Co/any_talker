// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useEffect, useState } from "react";
import { useI18n } from "../i18n-context";
import { api, type MeResponse, type SpendSummary } from "../api-client";
import { SpendingCard } from "../components/spending-card";
import { composeFullName, type Gender } from "../../../shared/types";
import { type Lang } from "../../../shared/i18n";
import {
  DATE_FORMATS,
  DATE_FORMAT_SAMPLE_MS,
  formatDateTime,
  type DateFormat,
} from "../../../shared/date-format";
import { validateDisplayName } from "../../../shared/display-name";
import {
  Card,
  SectionFooter,
  SectionHeader,
  Stack,
} from "../components/layout";
import { RowButton, SaveButton } from "../components/controls";
import { SelectRow } from "../components/select-row";
import { DisplayNameField } from "../components/display-name-field";
import { GenderField } from "../components/gender-field";
import { TimezoneField } from "../components/timezone-field";
import { LanguageField } from "../components/language-field";

export function MainView({
  me,
  onMe,
  onOpenAdmin,
  onOpenMyReminders,
  onOpenMyFacts,
}: {
  me: MeResponse;
  onMe: (m: MeResponse) => void;
  onOpenAdmin: () => void;
  onOpenMyReminders: () => void;
  onOpenMyFacts: () => void;
}) {
  const { t: s, lang: resolvedLang } = useI18n();
  const [name, setName] = useState(me.displayName ?? "");
  const [tzOverride, setTzOverride] = useState(me.timezone !== null);
  const [tzValue, setTzValue] = useState(me.timezone ?? "UTC");
  const [genderOn, setGenderOn] = useState(me.gender !== null);
  const [genderValue, setGenderValue] = useState<Gender>(me.gender ?? "male");
  const [langValue, setLangValue] = useState<Lang>(resolvedLang);
  const [dateFormatValue, setDateFormatValue] = useState<DateFormat | null>(
    me.dateFormat,
  );
  const [saving, setSaving] = useState(false);
  const [spending, setSpending] = useState<SpendSummary | null>(null);

  useEffect(() => {
    api.getMySpending().then((r) => setSpending(r.spending));
  }, []);

  const tg = window.Telegram?.WebApp;
  const tgUser = tg?.initDataUnsafe?.user;
  const tgName = tgUser
    ? composeFullName(tgUser.first_name, tgUser.last_name)
    : "";

  const desiredTz = tzOverride ? tzValue : null;
  const desiredGender: Gender | null = genderOn ? genderValue : null;
  const nameValidation = validateDisplayName(name);
  const nameError = !nameValidation.ok ? nameValidation.reason : null;
  const dirty =
    name.trim() !== (me.displayName ?? "") ||
    desiredTz !== me.timezone ||
    desiredGender !== me.gender ||
    langValue !== resolvedLang ||
    dateFormatValue !== me.dateFormat;

  const save = async () => {
    setSaving(true);
    try {
      const next = await api.putMe({
        displayName: name.trim() || null,
        timezone: desiredTz,
        gender: desiredGender,
        language: langValue,
        dateFormat: dateFormatValue,
      });
      onMe(next);
      setName(next.displayName ?? "");
      setTzOverride(next.timezone !== null);
      setTzValue(next.timezone ?? "UTC");
      setGenderOn(next.gender !== null);
      setGenderValue(next.gender ?? "male");
      setLangValue(next.language ?? resolvedLang);
      setDateFormatValue(next.dateFormat);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack>
      <DisplayNameField
        label={s.ui_main_name}
        placeholder={tgName || s.ui_main_your_name}
        footer={s.ui_main_name_footer}
        value={name}
        onChange={setName}
        error={nameError}
      />

      <GenderField
        enabled={genderOn}
        onEnabledChange={setGenderOn}
        value={genderValue}
        onChange={setGenderValue}
      />

      <TimezoneField
        enabled={tzOverride}
        onEnabledChange={setTzOverride}
        value={tzValue}
        onChange={setTzValue}
      />

      <SectionHeader>{s.ui_main_time_format}</SectionHeader>
      <Card>
        <SelectRow
          label={s.ui_main_time_format_auto}
          selected={dateFormatValue === null}
          onSelect={() => setDateFormatValue(null)}
        />
        {DATE_FORMATS.map((fmt) => (
          <SelectRow
            key={fmt}
            label={formatDateTime(DATE_FORMAT_SAMPLE_MS, fmt, desiredTz)}
            selected={dateFormatValue === fmt}
            onSelect={() => setDateFormatValue(fmt)}
          />
        ))}
      </Card>
      <SectionFooter>{s.ui_main_time_format_footer}</SectionFooter>

      <LanguageField value={langValue} onChange={setLangValue} />

      <SaveButton
        saving={saving}
        dirty={dirty}
        disabled={saving || !dirty || nameError !== null}
        onClick={save}
      />

      {spending && <SpendingCard spending={spending} />}

      <SectionHeader>{s.ui_main_reminders}</SectionHeader>
      <Card>
        <RowButton onClick={onOpenMyReminders}>
          {s.ui_main_my_reminders}
        </RowButton>
      </Card>

      <SectionHeader>{s.ui_main_memory}</SectionHeader>
      <Card>
        <RowButton onClick={onOpenMyFacts}>{s.ui_main_my_facts}</RowButton>
      </Card>

      {me.isOwner && (
        <>
          <SectionHeader>{s.ui_main_bot_config}</SectionHeader>
          <Card>
            <RowButton onClick={onOpenAdmin}>{s.ui_main_admin_panel}</RowButton>
          </Card>
        </>
      )}
    </Stack>
  );
}
