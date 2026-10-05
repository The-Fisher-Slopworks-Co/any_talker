// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useRef, useState } from "react";
import { useI18n } from "../i18n-context";
import { api } from "../api-client";
import { isValidLang, SUPPORTED_LANGS, type Lang } from "../../../shared/i18n";
import { validateDisplayName } from "../../../shared/display-name";
import type { Gender } from "../../../shared/types";
import { DISPLAY_NAME_ERR_KEY, LANG_LABEL_KEY } from "../lib/labels";
import { useAutosave } from "../lib/use-autosave";
import { GenderPickerRow } from "./gender-picker-row";
import { Card, SectionFooter, SectionHeader } from "./layout";
import { SaveStatus } from "./save-status";
import { TextRow } from "./text-row";
import { TimezonePickerRow } from "./timezone-picker-row";
import { ValueSelectRow } from "./value-select-row";

export type UserAbout = {
  displayName: string | null;
  timezone: string | null;
  gender: Gender | null;
  language: Lang | null;
};

type Patch = Partial<UserAbout>;

// `<select>` values are strings, so "automatic" (null) travels as "".
const AUTO = "";

// What an admin can set on somebody else's profile: the name the AI uses,
// gender, timezone and language, as one card of rows. Every pick is saved at
// once, the name when the field is left; a rejected field goes back to the
// last value the server confirmed.
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
  const [fields, setFields] = useState(initial);
  const [name, setName] = useState(initial.displayName ?? "");
  // What each field was last set to. A refused change only puts its field
  // back when no newer change to it was made since, or it would undo that one
  // on screen.
  const requested = useRef<Patch>({});
  const { save, status } = useAutosave<Patch, UserAbout>({
    send: (patch) => api.putAdminUser(userId, patch),
    onSaved: ({ displayName, timezone, gender, language }) =>
      setSaved({ displayName, timezone, gender, language }),
    onFailed: (patch) => {
      const keys = Object.keys(patch) as (keyof UserAbout)[];
      const stale = keys.filter((k) => requested.current[k] === patch[k]);
      if (stale.includes("displayName")) setName(saved.displayName ?? "");
      setFields((f) => ({
        ...f,
        ...Object.fromEntries(stale.map((k) => [k, saved[k]])),
      }));
    },
  });

  const validation = validateDisplayName(name);
  const nameError = validation.ok ? null : validation.reason;

  const choose = (patch: Patch) => {
    requested.current = { ...requested.current, ...patch };
    setFields((f) => ({ ...f, ...patch }));
    save(patch);
  };

  const commitName = () => {
    const next = name.trim();
    if (nameError !== null || next === (saved.displayName ?? "")) return;
    setName(next);
    const displayName = next || null;
    requested.current = { ...requested.current, displayName };
    save({ displayName });
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
          value={fields.gender}
          onChange={(gender) => choose({ gender })}
        />
        <TimezonePickerRow
          value={fields.timezone}
          onChange={(timezone) => choose({ timezone })}
        />
        <ValueSelectRow
          label={s.ui_main_language}
          value={fields.language ?? AUTO}
          onChange={(v) => choose({ language: isValidLang(v) ? v : null })}
        >
          <option value={AUTO}>{s.ui_main_tz_auto}</option>
          {SUPPORTED_LANGS.map((code) => (
            <option key={code} value={code}>
              {s[LANG_LABEL_KEY[code]]}
            </option>
          ))}
        </ValueSelectRow>
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
