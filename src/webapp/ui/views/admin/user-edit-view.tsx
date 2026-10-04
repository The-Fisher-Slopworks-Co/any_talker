// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useEffect, useState } from "react";
import { useI18n } from "../../i18n-context";
import { useDateFmt } from "../../datetime-context";
import { TimeNote } from "../../components/time-note";
import {
  api,
  type SpendSummary,
  type UserSettingsResponse,
} from "../../api-client";
import { SpendingCard } from "../../components/spending-card";
import { UserLimitsSection } from "../../components/user-limits-section";
import { DEFAULT_LANG, type Lang } from "../../../../shared/i18n";
import {
  Card,
  SectionFooter,
  SectionHeader,
  Stack,
} from "../../components/layout";
import { LargeTitle } from "../../components/large-title";
import { LoadingState } from "../../components/states";
import { SaveButton } from "../../components/controls";
import { SelectRow } from "../../components/select-row";
import { TimezoneField } from "../../components/timezone-field";
import { LanguageField } from "../../components/language-field";
import { UserAboutSection } from "../../components/user-about-section";
import { AccessRows } from "../../components/access-rows";
import { Hero } from "../../components/hero";
import { ROW_CLS, ROW_LABEL_CLS, ROW_VALUE_CLS } from "../../components/row";
import { botLabel, userDisplayName } from "../../lib/labels";
import { FactsEditor, type FactsWriter } from "../facts-view";
import { useLoadable } from "../../lib/use-loadable";
import { parseString, useSessionState } from "../../lib/session-state";
import { openTelegramProfile } from "../../lib/telegram";

export function UserEditView({ userId }: { userId: string }) {
  const { t: s } = useI18n();
  const { short } = useDateFmt();
  const [data, setData] = useState<UserSettingsResponse | null>(null);
  const [tzOverride, setTzOverride] = useState(false);
  const [tzValue, setTzValue] = useState("UTC");
  const [langOn, setLangOn] = useState(false);
  const [langValue, setLangValue] = useState<Lang>(DEFAULT_LANG);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [spending, setSpending] = useState<SpendSummary | null>(null);
  const { data: botsData } = useLoadable(api.listMyBots, []);
  const [factScope, setFactScope] = useSessionState(
    `user-facts-scope:${userId}`,
    "main",
    parseString,
  );
  const { data: factsData, setData: setFactsData } = useLoadable(
    () => api.listUserFacts(userId, factScope),
    [userId, factScope],
  );

  useEffect(() => {
    api
      .getAdminUser(userId)
      .then((d) => {
        setData(d);
        setTzOverride(d.timezone !== null);
        setTzValue(d.timezone ?? "UTC");
        setLangOn(d.language !== null);
        setLangValue(d.language ?? DEFAULT_LANG);
      })
      .catch(() => setNotFound(true));
    api.getUserSpending(userId).then((r) => setSpending(r.spending));
  }, [userId]);

  // Until the hero can name the user, the page is titled like any other.
  if (notFound || !data)
    return (
      <>
        <LargeTitle>{s.ui_route_user_settings}</LargeTitle>
        {notFound ? (
          <LoadingState text={s.ui_user_not_found} />
        ) : (
          <LoadingState />
        )}
      </>
    );

  const { user } = data;
  const factBots = botsData?.bots ?? null;
  const factsWriter: FactsWriter = {
    add: (scope, fact) => api.addUserFact(userId, scope, fact),
    update: (scope, key, patch) =>
      api.updateUserFact(userId, scope, key, patch),
    remove: (scope, key) => api.deleteUserFact(userId, scope, key),
  };
  const fallbackName = userDisplayName(user);
  const effectiveName = userDisplayName(user, data.displayName);
  const desiredTz = tzOverride ? tzValue : null;
  const desiredLang: Lang | null = langOn ? langValue : null;
  const dirty = desiredTz !== data.timezone || desiredLang !== data.language;

  const save = async () => {
    setSaving(true);
    try {
      const next = await api.putAdminUser(userId, {
        timezone: desiredTz,
        language: desiredLang,
      });
      setData((prev) => (prev ? { ...prev, ...next } : null));
      setTzOverride(next.timezone !== null);
      setTzValue(next.timezone ?? "UTC");
      setLangOn(next.language !== null);
      setLangValue(next.language ?? DEFAULT_LANG);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack>
      <Hero
        id={user.id}
        name={fallbackName}
        subtitle={user.username ? `@${user.username}` : undefined}
        action={{
          label: s.ui_user_open_in_tg,
          onClick: () => openTelegramProfile(user),
        }}
      />
      <Card>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_user_id}</span>
          <span className={ROW_VALUE_CLS}>{user.id}</span>
        </div>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_user_last_seen}</span>
          <span className={ROW_VALUE_CLS}>{short(user.lastSeenAt)}</span>
        </div>
      </Card>
      <SectionFooter>
        <TimeNote />
      </SectionFooter>

      <AccessRows
        kind="users"
        id={user.id}
        label={effectiveName}
        whitelisted={data.whitelisted}
        blacklisted={data.blacklisted}
        footer={s.ui_access_footer_user}
      />

      <UserLimitsSection
        userId={user.id}
        initialClass={data.limitClass}
        allowanceMonthUsd={data.allowanceMonthUsd}
      />

      <UserAboutSection
        userId={user.id}
        fallbackName={fallbackName}
        initial={{ displayName: data.displayName, gender: data.gender }}
      />

      <TimezoneField
        enabled={tzOverride}
        onEnabledChange={setTzOverride}
        value={tzValue}
        onChange={setTzValue}
      />

      <LanguageField
        value={langValue}
        onChange={setLangValue}
        toggle={{ enabled: langOn, onEnabledChange: setLangOn }}
      />

      <SaveButton
        saving={saving}
        dirty={dirty}
        disabled={saving || !dirty}
        onClick={save}
      />

      {spending && <SpendingCard spending={spending} />}

      <SectionHeader>{s.ui_user_facts_header}</SectionHeader>
      {factBots && factBots.length > 1 ? (
        <Card>
          {factBots.map((b) => (
            <SelectRow
              key={b.botId ?? "main"}
              label={botLabel(s, b)}
              selected={factScope === (b.botId ?? "main")}
              onSelect={() => setFactScope(b.botId ?? "main")}
            />
          ))}
        </Card>
      ) : null}
      {factsData === null ? (
        <LoadingState />
      ) : (
        <>
          <FactsEditor
            key={factScope}
            writer={factsWriter}
            scope={factScope}
            data={factsData}
            onChange={setFactsData}
          />
          <SectionFooter>
            {s.ui_facts_count(factsData.facts.length, factsData.cap)}
          </SectionFooter>
        </>
      )}
    </Stack>
  );
}
