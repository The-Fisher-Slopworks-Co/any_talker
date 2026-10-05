// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../../i18n-context";
import { useDateFmt } from "../../datetime-context";
import { TimeNote } from "../../components/time-note";
import { api } from "../../api-client";
import { SpendingCard } from "../../components/spending-card";
import {
  UserLimitsSection,
  userUsageLoad,
} from "../../components/user-limits-section";
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
import { FactsEditor, myBotsLoad, type FactsWriter } from "../facts-view";
import { useLoadable } from "../../lib/use-loadable";
import {
  parseString,
  readSession,
  useSessionState,
} from "../../lib/session-state";
import { openTelegramProfile } from "../../lib/telegram";

const scopeKey = (userId: string) => `user-facts-scope:${userId}`;

// The user record seeds sections that then edit their own copy of it.
export function userEditLoads(
  userId: string,
  factScope = readSession(scopeKey(userId), parseString) ?? "main",
) {
  return {
    user: {
      key: `admin-user:${userId}`,
      load: () => api.getAdminUser(userId),
      once: true,
    },
    spending: {
      key: `user-spending:${userId}`,
      load: () => api.getUserSpending(userId),
    },
    // Loaded by the limits section, which is part of the first frame.
    usage: userUsageLoad(userId),
    bots: myBotsLoad,
    facts: {
      key: `user-facts:${userId}:${factScope}`,
      load: () =>
        api
          .listUserFacts(userId, factScope)
          .then((r) => ({ ...r, scope: factScope })),
    },
  };
}

export function UserEditView({ userId }: { userId: string }) {
  const { t: s } = useI18n();
  const { short } = useDateFmt();
  const [factScope, setFactScope] = useSessionState(
    scopeKey(userId),
    "main",
    parseString,
  );
  const loads = userEditLoads(userId, factScope);
  const { data, error: notFound } = useLoadable(loads.user);
  const spent = useLoadable(loads.spending);
  // null while loading (the card holds its place), undefined if it failed.
  const spending = spent.data
    ? spent.data.spending
    : spent.error
      ? undefined
      : null;
  const { data: botsData, error: botsError } = useLoadable(loads.bots);
  const { data: factsData, setData: setFactsData } = useLoadable(loads.facts);
  // Whether a bot picker heads the facts is unknown until the bots land, so
  // picker and list first show together; a later scope switch keeps both up.
  const factsReady = (botsData !== null || botsError) && factsData !== null;

  // Until the hero can name the user, the page is titled like any other.
  if (!data)
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
