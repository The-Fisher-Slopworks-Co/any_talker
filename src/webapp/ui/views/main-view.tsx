// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useState } from "react";
import { useI18n } from "../i18n-context";
import { api, type MeResponse } from "../api-client";
import { composeFullName, type Gender } from "../../../shared/types";
import { validateDisplayName } from "../../../shared/display-name";
import { Card, Stack } from "../components/layout";
import { SaveStatus } from "../components/save-status";
import { NavRow } from "../components/select-row";
import { SettingsIcon } from "../components/settings-icon";
import {
  AboutYouSection,
  LanguageRegionSection,
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
  const [timezone, setTimezone] = useState<string | null>(me.timezone);
  const [gender, setGender] = useState<Gender | null>(me.gender);
  const [choices, setChoices] = useState<ProfileChoices>({
    dateFormat: me.dateFormat,
    language: resolvedLang,
  });
  // Each change is saved on its own as soon as it is made; responses only feed
  // `onMe`, never the fields, so a slow answer cannot undo a newer change.
  const { save, status } = useAutosave<ProfilePatch, MeResponse>({
    send: api.putMe,
    onSaved: onMe,
    // A rejected field goes back to its last saved value.
    onFailed: (patch) => {
      if ("displayName" in patch) setName(me.displayName ?? "");
      if ("gender" in patch) setGender(me.gender);
      if ("timezone" in patch) setTimezone(me.timezone);
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
      <AboutYouSection
        name={name}
        namePlaceholder={tgName || s.ui_main_your_name}
        nameError={nameError}
        onNameChange={setName}
        onNameCommit={commitName}
        gender={gender}
        onGender={(g) => {
          setGender(g);
          save({ gender: g });
        }}
      />

      <LanguageRegionSection
        choices={choices}
        onChoice={choose}
        timezone={timezone}
        onTimezone={(tz) => {
          setTimezone(tz);
          save({ timezone: tz });
        }}
      />

      <SaveStatus status={status} />

      <div className="section-gap">
        <Card>
          <NavRow
            title={s.ui_main_reminders}
            icon={<SettingsIcon tint="orange" glyph="bell" />}
            onClick={onOpenMyReminders}
          />
          <NavRow
            title={s.ui_route_my_facts}
            icon={<SettingsIcon tint="purple" glyph="memory" />}
            onClick={onOpenMyFacts}
          />
        </Card>
      </div>

      {me.isOwner && (
        <div className="section-gap">
          <Card>
            <NavRow
              title={s.ui_main_admin_panel}
              icon={<SettingsIcon tint="gray" glyph="gear" />}
              onClick={onOpenAdmin}
            />
          </Card>
        </div>
      )}
    </Stack>
  );
}
