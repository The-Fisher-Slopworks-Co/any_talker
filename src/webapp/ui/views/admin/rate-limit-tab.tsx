// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../../i18n-context";
import type { Settings } from "../../../../shared/types";
import { SectionFooter, SectionHeader, Stack } from "../../components/layout";
import { RateLimitFields } from "../../components/rate-limit-fields";
import { SaveStatus } from "../../components/save-status";
import { TimeNote } from "../../components/time-note";
import { LimitBoostCard } from "../../components/limit-boost-card";
import { LimitClassesCard } from "../../components/limit-classes-card";
import { useSettingsAutosave } from "../../lib/use-settings-autosave";

export function RateLimitTab({
  settings,
  onSaved,
}: {
  settings: Settings;
  onSaved: (s: Settings) => void;
}) {
  const { t: s } = useI18n();
  const { draft, save, status } = useSettingsAutosave({ settings, onSaved });

  return (
    <Stack>
      <RateLimitFields value={draft.rateLimit} save={save} />
      <SectionFooter>{s.ui_ratelimit_footer}</SectionFooter>

      <SectionHeader>{s.ui_boost_header}</SectionHeader>
      <LimitBoostCard boost={draft.limitBoost} save={save} />
      <SectionFooter>
        {s.ui_boost_footer} <TimeNote />
      </SectionFooter>

      <LimitClassesCard classes={draft.limitClasses} save={save} />

      <SaveStatus status={status} />
    </Stack>
  );
}
