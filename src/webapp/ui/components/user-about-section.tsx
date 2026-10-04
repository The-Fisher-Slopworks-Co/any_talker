// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useState } from "react";
import { useI18n } from "../i18n-context";
import { api } from "../api-client";
import { validateDisplayName } from "../../../shared/display-name";
import type { Gender } from "../../../shared/types";
import { DISPLAY_NAME_ERR_KEY } from "../lib/labels";
import { useAutosave } from "../lib/use-autosave";
import { GenderPickerRow } from "./gender-picker-row";
import { Card, SectionFooter, SectionHeader } from "./layout";
import { SaveStatus } from "./save-status";
import { TextRow } from "./text-row";

export type UserAbout = {
  displayName: string | null;
  gender: Gender | null;
};

type Patch = Partial<UserAbout>;

// What an admin can set on somebody else's profile, as one card of rows.
// Every pick is saved at once, the name when the field is left; a rejected
// field goes back to the last value the server confirmed.
export function UserAboutSection({
  userId,
  fallbackName,
  initial,
}: {
  userId: string;
  // What the AI calls the user while no name is set.
  fallbackName: string;
  initial: UserAbout;
}) {
  const { t: s } = useI18n();
  const [saved, setSaved] = useState(initial);
  const [gender, setGender] = useState(initial.gender);
  const [name, setName] = useState(initial.displayName ?? "");
  const { save, status } = useAutosave<Patch, UserAbout>({
    send: (patch) => api.putAdminUser(userId, patch),
    onSaved: (next) =>
      setSaved({ displayName: next.displayName, gender: next.gender }),
    onFailed: (patch) => {
      if ("displayName" in patch) setName(saved.displayName ?? "");
      if ("gender" in patch) setGender(saved.gender);
    },
  });

  const validation = validateDisplayName(name);
  const nameError = validation.ok ? null : validation.reason;

  const commitName = () => {
    const next = name.trim();
    if (nameError !== null || next === (saved.displayName ?? "")) return;
    setName(next);
    save({ displayName: next || null });
  };

  return (
    <>
      <SectionHeader>{s.ui_user_about}</SectionHeader>
      <Card>
        <TextRow
          label={s.ui_main_name}
          placeholder={fallbackName}
          value={name}
          onChange={setName}
          onCommit={commitName}
        />
        <GenderPickerRow
          value={gender}
          onChange={(next) => {
            setGender(next);
            save({ gender: next });
          }}
        />
      </Card>
      <SectionFooter>
        {nameError ? (
          <span className="text-tg-destructive">
            {s[DISPLAY_NAME_ERR_KEY[nameError]]}
          </span>
        ) : (
          s.ui_user_about_footer(fallbackName)
        )}
      </SectionFooter>
      <SaveStatus status={status} />
    </>
  );
}
