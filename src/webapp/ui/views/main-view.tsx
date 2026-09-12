// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useEffect, useState } from "react";
import { useI18n } from "../i18n-context";
import { api, type MeResponse, type SpendSummary } from "../api-client";
import { SpendingCard } from "../components/spending-card";
import { composeFullName, type Gender } from "../../../shared/types";
import { validateDisplayName } from "../../../shared/display-name";
import { Card, SectionHeader, Stack } from "../components/layout";
import { RowButton } from "../components/controls";
import { SaveStatus } from "../components/save-status";
import { GenderField } from "../components/gender-field";
import { TimezoneField } from "../components/timezone-field";
import {
  ProfileSettingsCard,
  type ProfileChoices,
} from "../components/profile-settings-card";
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
  const [choices, setChoices] = useState<ProfileChoices>({
    dateFormat: me.dateFormat,
    language: resolvedLang,
  });
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
      setChoices((c) => ({
        dateFormat: "dateFormat" in patch ? me.dateFormat : c.dateFormat,
        language: "language" in patch ? resolvedLang : c.language,
      }));
    },
  });

  const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
  const tgName = tgUser
    ? composeFullName(tgUser.first_name, tgUser.last_name)
    : "";

  const nameValidation = validateDisplayName(name);
  const nameError = !nameValidation.ok ? nameValidation.reason : null;

  // The name is saved when the input is left, not on every keystroke.
  const commitName = () => {
    const next = name.trim();
    if (nameError !== null || next === (me.displayName ?? "")) return;
    save({ displayName: next || null });
  };

  const choose = (patch: Partial<ProfileChoices>) => {
    setChoices((c) => ({ ...c, ...patch }));
    save(patch);
  };

  return (
    <Stack>
      <ProfileSettingsCard
        name={name}
        namePlaceholder={tgName || s.ui_main_your_name}
        nameError={nameError}
        onNameChange={setName}
        onNameCommit={commitName}
        choices={choices}
        onChoice={choose}
        timezone={tzOverride ? tzValue : null}
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
