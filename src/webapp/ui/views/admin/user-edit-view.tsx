// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useEffect, useState } from "react";
import { useI18n } from "../../i18n-context";
import {
  api,
  type SpendSummary,
  type UserBucketEntry,
  type UserSettingsResponse,
} from "../../api-client";
import { SpendingCard } from "../../components/spending-card";
import type { Gender } from "../../../../shared/types";
import {
  SUPPORTED_LANGS,
  DEFAULT_LANG,
  type Lang,
} from "../../../../shared/i18n";
import {
  Card,
  SectionFooter,
  SectionHeader,
  Stack,
} from "../../components/layout";
import { EmptyState, LoadingState } from "../../components/states";
import { RowButton, SaveButton, Toggle } from "../../components/controls";
import { SelectRow } from "../../components/select-row";
import { TimezoneSelect } from "../../components/timezone-select";
import { WhitelistToggleButton } from "../../components/whitelist-toggle-button";
import {
  INPUT_CLS,
  ROW_CLS,
  ROW_LABEL_CLS,
  ROW_VALUE_CLS,
} from "../../components/row";
import {
  chatSubtitle,
  chatTitle,
  DISPLAY_NAME_ERR_KEY,
  LANG_LABEL_KEY,
  userDisplayName,
} from "../../lib/labels";
import { openTelegramProfile } from "../../lib/telegram";
import { validateDisplayName } from "../../../../shared/display-name";

export function UserEditView({ userId }: { userId: string }) {
  const { t: s } = useI18n();
  const [data, setData] = useState<UserSettingsResponse | null>(null);
  const [name, setName] = useState("");
  const [tzOverride, setTzOverride] = useState(false);
  const [tzValue, setTzValue] = useState("UTC");
  const [genderOn, setGenderOn] = useState(false);
  const [genderValue, setGenderValue] = useState<Gender>("male");
  const [langOn, setLangOn] = useState(false);
  const [langValue, setLangValue] = useState<Lang>(DEFAULT_LANG);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [buckets, setBuckets] = useState<UserBucketEntry[] | null>(null);
  const [capacity, setCapacity] = useState<number | null>(null);
  const [spending, setSpending] = useState<SpendSummary | null>(null);

  useEffect(() => {
    api
      .getAdminUser(userId)
      .then((d) => {
        setData(d);
        setName(d.displayName ?? "");
        setTzOverride(d.timezone !== null);
        setTzValue(d.timezone ?? "UTC");
        setGenderOn(d.gender !== null);
        setGenderValue(d.gender ?? "male");
        setLangOn(d.language !== null);
        setLangValue(d.language ?? DEFAULT_LANG);
      })
      .catch(() => setNotFound(true));
    api.getUserBuckets(userId).then((r) => setBuckets(r.buckets));
    api.getUserSpending(userId).then((r) => setSpending(r.spending));
    api.getSettings().then((s) => setCapacity(s.rateLimit.capacity));
  }, [userId]);

  const resetBucket = async (chatId: string) => {
    const r = await api.resetUserBucket(userId, chatId);
    setBuckets(r.buckets);
  };

  if (notFound) return <LoadingState text={s.ui_user_not_found} />;
  if (!data) return <LoadingState />;

  const { user } = data;
  const fallbackName = userDisplayName(user);
  const effectiveName = userDisplayName(user, data.displayName);
  const desiredTz = tzOverride ? tzValue : null;
  const desiredGender: Gender | null = genderOn ? genderValue : null;
  const desiredLang: Lang | null = langOn ? langValue : null;
  const nameValidation = validateDisplayName(name);
  const nameError = !nameValidation.ok ? nameValidation.reason : null;
  const dirty =
    name.trim() !== (data.displayName ?? "") ||
    desiredTz !== data.timezone ||
    desiredGender !== data.gender ||
    desiredLang !== data.language;

  const save = async () => {
    setSaving(true);
    try {
      const next = await api.putAdminUser(userId, {
        displayName: name.trim() || null,
        timezone: desiredTz,
        gender: desiredGender,
        language: desiredLang,
      });
      setData((prev) => (prev ? { ...prev, ...next } : null));
      setName(next.displayName ?? "");
      setTzOverride(next.timezone !== null);
      setTzValue(next.timezone ?? "UTC");
      setGenderOn(next.gender !== null);
      setGenderValue(next.gender ?? "male");
      setLangOn(next.language !== null);
      setLangValue(next.language ?? DEFAULT_LANG);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack>
      <SectionHeader>{s.ui_user_profile}</SectionHeader>
      <Card>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_user_name}</span>
          <span className={ROW_VALUE_CLS}>{fallbackName}</span>
        </div>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_user_username}</span>
          <span className={ROW_VALUE_CLS}>
            {user.username ? `@${user.username}` : s.ui_dash}
          </span>
        </div>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_user_id}</span>
          <span className={ROW_VALUE_CLS}>{user.id}</span>
        </div>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_user_last_seen}</span>
          <span className={ROW_VALUE_CLS}>
            {new Date(user.lastSeenAt).toLocaleString()}
          </span>
        </div>
        <RowButton onClick={() => openTelegramProfile(user)}>
          {s.ui_user_open_in_tg}
        </RowButton>
        <WhitelistToggleButton
          kind="users"
          id={user.id}
          label={effectiveName}
          initial={data.whitelisted}
        />
      </Card>

      <SectionHeader>{s.ui_main_display_name}</SectionHeader>
      <Card>
        <label className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_user_name}</span>
          <input
            className={INPUT_CLS}
            placeholder={fallbackName}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
      </Card>
      <SectionFooter>
        {nameError ? (
          <span className="text-tg-destructive">
            {s[DISPLAY_NAME_ERR_KEY[nameError]]}
          </span>
        ) : (
          s.ui_user_display_name_footer
        )}
      </SectionFooter>

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
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_user_set_language}</span>
          <span className="flex-1" />
          <Toggle value={langOn} onChange={setLangOn} />
        </div>
      </Card>
      {langOn ? (
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
      ) : null}
      <SectionFooter>{s.ui_main_language_footer}</SectionFooter>

      <SaveButton
        saving={saving}
        dirty={dirty}
        disabled={saving || !dirty || nameError !== null}
        onClick={save}
      />

      {spending && <SpendingCard spending={spending} />}

      <SectionHeader>{s.ui_user_bucket}</SectionHeader>
      {buckets === null ? null : buckets.length === 0 ? (
        <Card>
          <EmptyState>{s.ui_ratelimit_no_bucket}</EmptyState>
        </Card>
      ) : (
        buckets.map(({ chat, bucket }) => (
          <Card key={chat.id}>
            <div className={ROW_CLS}>
              <span className={ROW_LABEL_CLS}>{chatTitle(s, chat)}</span>
              <span className={ROW_VALUE_CLS}>{chatSubtitle(chat)}</span>
            </div>
            <div className={ROW_CLS}>
              <span className={ROW_LABEL_CLS}>{s.ui_ratelimit_tokens}</span>
              <span className={ROW_VALUE_CLS}>
                {bucket.tokens.toLocaleString()}
                {capacity !== null ? ` / ${capacity.toLocaleString()}` : ""}
              </span>
            </div>
            <div className={ROW_CLS}>
              <span className={ROW_LABEL_CLS}>
                {s.ui_ratelimit_last_refill}
              </span>
              <span className={ROW_VALUE_CLS}>
                {new Date(bucket.lastRefillTs).toLocaleString()}
              </span>
            </div>
            <RowButton onClick={() => resetBucket(chat.id)}>
              {s.ui_ratelimit_reset}
            </RowButton>
          </Card>
        ))
      )}
    </Stack>
  );
}
