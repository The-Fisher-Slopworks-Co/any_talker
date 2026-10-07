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
import {
  Card,
  SectionFooter,
  SectionHeader,
  Stack,
} from "../../components/layout";
import { LargeTitle } from "../../components/large-title";
import { LoadingState } from "../../components/states";
import { CharacterPickerRow } from "../../components/character-picker-row";
import { UserAboutSection } from "../../components/user-about-section";
import { AccessRows } from "../../components/access-rows";
import { Hero } from "../../components/hero";
import { ROW_CLS, ROW_LABEL_CLS, ROW_VALUE_CLS } from "../../components/row";
import { userDisplayName } from "../../lib/labels";
import { FactsEditor, type FactsWriter } from "../facts-view";
import { useLoadable } from "../../lib/use-loadable";
import { parseString, useSessionState } from "../../lib/session-state";
import { openTelegramProfile } from "../../lib/telegram";

export function UserEditView({ userId }: { userId: string }) {
  const { t: s } = useI18n();
  const { short } = useDateFmt();
  const [data, setData] = useState<UserSettingsResponse | null>(null);
  const [notFound, setNotFound] = useState(false);
  // null while loading (the card holds its place), undefined if it failed.
  const [spending, setSpending] = useState<SpendSummary | null | undefined>(
    null,
  );
  const { data: botsData, error: botsError } = useLoadable(
    "my-bots",
    api.listMyBots,
  );
  const [factScope, setFactScope] = useSessionState(
    `user-facts-scope:${userId}`,
    "main",
    parseString,
  );
  const { data: factsData, setData: setFactsData } = useLoadable(
    `user-facts:${userId}:${factScope}`,
    () =>
      api
        .listUserFacts(userId, factScope)
        .then((r) => ({ ...r, scope: factScope })),
  );
  // Whether a bot picker heads the facts is unknown until the bots land, so
  // picker and list first show together; a later scope switch keeps both up.
  const factsReady = (botsData !== null || botsError) && factsData !== null;

  useEffect(() => {
    api
      .getAdminUser(userId)
      .then(setData)
      .catch(() => setNotFound(true));
    api
      .getUserSpending(userId)
      .then((r) => setSpending(r.spending))
      .catch(() => setSpending(undefined));
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
        initial={{
          displayName: data.displayName,
          timezone: data.timezone,
          gender: data.gender,
          language: data.language,
        }}
      />

      {spending !== undefined && <SpendingCard spending={spending} />}

      <SectionHeader>{s.ui_user_facts_header}</SectionHeader>
      {factsReady && factBots && factBots.length > 1 ? (
        <Card>
          <CharacterPickerRow
            bots={factBots}
            scope={factScope}
            onChange={setFactScope}
          />
        </Card>
      ) : null}
      {!factsReady || factsData === null ? (
        <LoadingState />
      ) : (
        <>
          <FactsEditor
            key={factsData.scope}
            writer={factsWriter}
            scope={factsData.scope}
            data={factsData}
            onChange={(next) =>
              setFactsData({ ...next, scope: factsData.scope })
            }
          />
          <SectionFooter>
            {s.ui_facts_count(factsData.facts.length, factsData.cap)}
          </SectionFooter>
        </>
      )}
    </Stack>
  );
}
