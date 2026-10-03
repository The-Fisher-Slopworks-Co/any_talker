// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useState } from "react";
import { useI18n } from "../../i18n-context";
import { api } from "../../api-client";
import type { RateLimitConfig, Settings } from "../../../../shared/types";
import { SectionFooter, SectionHeader, Stack } from "../../components/layout";
import { SaveButton } from "../../components/controls";
import { RateLimitFields } from "../../components/rate-limit-fields";
import { TimeNote } from "../../components/time-note";
import { LimitBoostCard } from "../../components/limit-boost-card";
import { LimitClassesCard } from "../../components/limit-classes-card";

export function RateLimitTab({
  settings,
  onSaved,
}: {
  settings: Settings;
  onSaved: (s: Settings) => void;
}) {
  const { t: s } = useI18n();
  const [config, setConfig] = useState<RateLimitConfig>(settings.rateLimit);
  const [saving, setSaving] = useState(false);

  const dirty = JSON.stringify(config) !== JSON.stringify(settings.rateLimit);

  const save = async () => {
    setSaving(true);
    const next = await api.putSettings({ rateLimit: config });
    onSaved(next);
    setSaving(false);
  };

  return (
    <Stack>
      <SectionHeader>{s.ui_ratelimit_limits}</SectionHeader>
      <RateLimitFields value={config} onChange={setConfig} />
      <SectionFooter>{s.ui_ratelimit_footer}</SectionFooter>

      <SaveButton saving={saving} dirty={dirty} onClick={save} />

      <SectionHeader>{s.ui_boost_header}</SectionHeader>
      <LimitBoostCard settings={settings} onSaved={onSaved} />
      <SectionFooter>
        {s.ui_boost_footer} <TimeNote />
      </SectionFooter>

      <LimitClassesCard settings={settings} onSaved={onSaved} />
    </Stack>
  );
}
