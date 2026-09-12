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
import { RowButton } from "../components/controls";
import { SaveStatus } from "../components/save-status";
import { SelectRow } from "../components/select-row";
import { DisplayNameField } from "../components/display-name-field";
import { GenderField } from "../components/gender-field";
import { TimezoneField } from "../components/timezone-field";
import { LanguageField } from "../components/language-field";
import { useAutosave } from "../lib/use-autosave";

type ProfilePatch = Parameters<typeof api.putMe>[0];

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
  const [spending, setSpending] = useState<SpendSummary | null>(null);

  useEffect(() => {
    api.getMySpending().then((r) => setSpending(r.spending));
  }, []);

  // Each change is saved on its own as soon as it is made; responses only feed
  // `onMe`, never the fields, so a slow answer cannot undo a newer change.
  const { save, status } = useAutosave<ProfilePatch, MeResponse>({
    send: api.putMe,
    onSaved: onMe,
    // A rejected field goes back to its last saved value.
    onFailed: (patch) => {
      if ("displayName" in patch) setName(me.displayName ?? "");
      if ("gender" in patch) {
        setGenderOn(me.gender !== null);
        if (me.gender !== null) setGenderValue(me.gender);
      }
      if ("timezone" in patch) {
        setTzOverride(me.timezone !== null);
        if (me.timezone !== null) setTzValue(me.timezone);
      }
      if ("language" in patch) setLangValue(resolvedLang);
      if ("dateFormat" in patch) setDateFormatValue(me.dateFormat);
    },
  });

  const tg = window.Telegram?.WebApp;
  const tgUser = tg?.initDataUnsafe?.user;
  const tgName = tgUser
    ? composeFullName(tgUser.first_name, tgUser.last_name)
    : "";

  const desiredTz = tzOverride ? tzValue : null;
  const nameValidation = validateDisplayName(name);
  const nameError = !nameValidation.ok ? nameValidation.reason : null;

  // The name is saved when the input is left, not on every keystroke.
  const commitName = () => {
    const next = name.trim();
    if (nameError !== null || next === (me.displayName ?? "")) return;
    save({ displayName: next || null });
  };

  return (
    <Stack>
      <DisplayNameField
        label={s.ui_main_name}
        placeholder={tgName || s.ui_main_your_name}
        footer={s.ui_main_name_footer}
        value={name}
        onChange={setName}
        onCommit={commitName}
        error={nameError}
      />

      <GenderField
        enabled={genderOn}
        onEnabledChange={(on) => {
          setGenderOn(on);
          save({ gender: on ? genderValue : null });
        }}
        value={genderValue}
        onChange={(g) => {
          setGenderValue(g);
          save({ gender: g });
        }}
      />

      <TimezoneField
        enabled={tzOverride}
        onEnabledChange={(on) => {
          setTzOverride(on);
          save({ timezone: on ? tzValue : null });
        }}
        value={tzValue}
        onChange={(tz) => {
          setTzValue(tz);
          save({ timezone: tz });
        }}
      />

      <SectionHeader>{s.ui_main_time_format}</SectionHeader>
      <Card>
        <SelectRow
          label={s.ui_main_time_format_auto}
          selected={dateFormatValue === null}
          onSelect={() => {
            setDateFormatValue(null);
            save({ dateFormat: null });
          }}
        />
        {DATE_FORMATS.map((fmt) => (
          <SelectRow
            key={fmt}
            label={formatDateTime(DATE_FORMAT_SAMPLE_MS, fmt, desiredTz)}
            selected={dateFormatValue === fmt}
            onSelect={() => {
              setDateFormatValue(fmt);
              save({ dateFormat: fmt });
            }}
          />
        ))}
      </Card>
      <SectionFooter>{s.ui_main_time_format_footer}</SectionFooter>

      <LanguageField
        value={langValue}
        onChange={(lang) => {
          setLangValue(lang);
          save({ language: lang });
        }}
      />

      <SaveStatus status={status} />

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
