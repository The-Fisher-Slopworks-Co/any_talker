// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useEffect, useState } from "react";
import { useI18n } from "../i18n-context";
import { api, type MeResponse, type OpenrouterKeyResponse } from "../api-client";
import { composeFullName, type Gender } from "../../../shared/types";
import { SUPPORTED_LANGS, type Lang } from "../../../shared/i18n";
import { Card, SectionFooter, SectionHeader, Stack } from "../components/layout";
import { PrimaryButton, RowButton, SaveButton, Toggle } from "../components/controls";
import { SelectRow } from "../components/select-row";
import { TimezoneSelect } from "../components/timezone-select";
import { INPUT_CLS, ROW_CLS, ROW_LABEL_CLS } from "../components/row";
import { LANG_LABEL_KEY } from "../lib/labels";

export function MainView({
  me,
  onMe,
  onOpenAdmin,
  onOpenMyReminders,
}: {
  me: MeResponse;
  onMe: (m: MeResponse) => void;
  onOpenAdmin: () => void;
  onOpenMyReminders: () => void;
}) {
  const { t: s, lang: resolvedLang } = useI18n();
  const [name, setName] = useState(me.displayName ?? "");
  const [tzOverride, setTzOverride] = useState(me.timezone !== null);
  const [tzValue, setTzValue] = useState(me.timezone ?? "UTC");
  const [genderOn, setGenderOn] = useState(me.gender !== null);
  const [genderValue, setGenderValue] = useState<Gender>(me.gender ?? "male");
  const [langValue, setLangValue] = useState<Lang>(resolvedLang);
  const [saving, setSaving] = useState(false);

  const tg = window.Telegram?.WebApp;
  const tgUser = tg?.initDataUnsafe?.user;
  const tgName = tgUser
    ? composeFullName(tgUser.first_name, tgUser.last_name)
    : "";

  const desiredTz = tzOverride ? tzValue : null;
  const desiredGender: Gender | null = genderOn ? genderValue : null;
  const dirty =
    name.trim() !== (me.displayName ?? "") ||
    desiredTz !== me.timezone ||
    desiredGender !== me.gender ||
    langValue !== resolvedLang;

  const save = async () => {
    setSaving(true);
    try {
      const next = await api.putMe({
        displayName: name.trim() || null,
        timezone: desiredTz,
        gender: desiredGender,
        language: langValue,
      });
      onMe(next);
      setName(next.displayName ?? "");
      setTzOverride(next.timezone !== null);
      setTzValue(next.timezone ?? "UTC");
      setGenderOn(next.gender !== null);
      setGenderValue(next.gender ?? "male");
      setLangValue(next.language ?? resolvedLang);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack>
      <SectionHeader>{s.ui_main_display_name}</SectionHeader>
      <Card>
        <label className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_main_name}</span>
          <input
            className={INPUT_CLS}
            placeholder={tgName || s.ui_main_your_name}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
      </Card>
      <SectionFooter>{s.ui_main_name_footer}</SectionFooter>

      <SectionHeader>{s.ui_main_gender}</SectionHeader>
      <Card>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_main_tell_ai}</span>
          <span className="flex-1" />
          <Toggle value={genderOn} onChange={setGenderOn} />
        </div>
      </Card>
      {genderOn ? (
        <Card>
          <SelectRow
            label={s.ui_main_male}
            selected={genderValue === "male"}
            onSelect={() => setGenderValue("male")}
          />
          <SelectRow
            label={s.ui_main_female}
            selected={genderValue === "female"}
            onSelect={() => setGenderValue("female")}
          />
        </Card>
      ) : null}
      <SectionFooter>{s.ui_main_gender_footer}</SectionFooter>

      <SectionHeader>{s.ui_main_timezone}</SectionHeader>
      <Card>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_main_use_my_tz}</span>
          <span className="flex-1" />
          <Toggle value={tzOverride} onChange={setTzOverride} />
        </div>
      </Card>
      {tzOverride ? (
        <TimezoneSelect value={tzValue} onChange={setTzValue} />
      ) : null}
      <SectionFooter>{s.ui_main_tz_footer}</SectionFooter>

      <SectionHeader>{s.ui_main_language}</SectionHeader>
      <Card>
        {SUPPORTED_LANGS.map((code) => (
          <SelectRow
            key={code}
            label={s[LANG_LABEL_KEY[code]]}
            selected={langValue === code}
            onSelect={() => setLangValue(code)}
          />
        ))}
      </Card>
      <SectionFooter>{s.ui_main_language_footer}</SectionFooter>

      <SaveButton saving={saving} dirty={dirty} onClick={save} />

      <OpenrouterKeySection />

      <SectionHeader>{s.ui_main_reminders}</SectionHeader>
      <Card>
        <RowButton onClick={onOpenMyReminders}>
          {s.ui_main_my_reminders}
        </RowButton>
      </Card>

      {me.isOwner && (
        <>
          <SectionHeader>{s.ui_main_bot_config}</SectionHeader>
          <Card>
            <RowButton onClick={onOpenAdmin}>
              {s.ui_main_admin_panel}
            </RowButton>
          </Card>
        </>
      )}
    </Stack>
  );
}

function OpenrouterKeySection() {
  const { t: s } = useI18n();
  const [state, setState] = useState<OpenrouterKeyResponse | null>(null);
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getMyOpenrouterKey().then(setState).catch(() => setState(null));
  }, []);

  const save = async () => {
    const trimmed = input.trim();
    if (trimmed.length === 0) return;
    setBusy(true);
    try {
      const next = await api.putMyOpenrouterKey(trimmed);
      setState(next);
      setInput("");
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    try {
      const next = await api.putMyOpenrouterKey(null);
      setState(next);
      setInput("");
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  const showInput = state !== null && (!state.hasKey || editing);

  return (
    <>
      <SectionHeader>{s.ui_main_byok}</SectionHeader>
      {state === null ? (
        <Card>
          <div className={ROW_CLS}>
            <span className={ROW_LABEL_CLS}>{s.ui_loading}</span>
          </div>
        </Card>
      ) : (
        <>
          {state.hasKey && !editing ? (
            <Card>
              <div className={ROW_CLS}>
                <span className="text-base tracking-widest">
                  ••••&nbsp;{state.last4}
                </span>
              </div>
            </Card>
          ) : null}
          {showInput ? (
            <Card>
              <label className={ROW_CLS}>
                <span className={ROW_LABEL_CLS}>
                  {s.ui_main_byok_key_label}
                </span>
                <input
                  className={INPUT_CLS}
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={s.ui_main_byok_placeholder}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                />
              </label>
            </Card>
          ) : null}
          {state.hasKey && !editing ? (
            <Card>
              <RowButton onClick={() => setEditing(true)} disabled={busy}>
                {s.ui_main_byok_replace}
              </RowButton>
              <RowButton onClick={clear} disabled={busy}>
                {s.ui_main_byok_clear}
              </RowButton>
            </Card>
          ) : (
            <>
              <PrimaryButton
                disabled={busy || input.trim().length === 0}
                onClick={save}
              >
                {busy ? s.ui_saving : s.ui_main_byok_save}
              </PrimaryButton>
              {state.hasKey ? (
                <Card>
                  <RowButton
                    onClick={() => {
                      setEditing(false);
                      setInput("");
                    }}
                    disabled={busy}
                  >
                    {s.ui_main_byok_cancel}
                  </RowButton>
                </Card>
              ) : null}
            </>
          )}
        </>
      )}
      <SectionFooter>{s.ui_main_byok_footer}</SectionFooter>
    </>
  );
}
