// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useEffect, useState } from "react";
import { useI18n } from "../../i18n-context";
import { api, type UsageStatus } from "../../api-client";
import type { RateLimitConfig, Settings } from "../../../../shared/types";
import {
  Card,
  SectionFooter,
  SectionHeader,
  Stack,
} from "../../components/layout";
import { RowButton, SaveButton } from "../../components/controls";
import { RateLimitFields } from "../../components/rate-limit-fields";
import { UsageCard } from "../../components/usage-card";

export function RateLimitTab({
  settings,
  onSaved,
}: {
  settings: Settings;
  onSaved: (s: Settings) => void;
}) {
  const { t: s } = useI18n();
  const [config, setConfig] = useState<RateLimitConfig>(settings.rateLimit);
  const [usage, setUsage] = useState<UsageStatus | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getMyUsage().then((r) => setUsage(r.usage));
  }, []);

  const dirty =
    JSON.stringify(config) !== JSON.stringify(settings.rateLimit);

  const save = async () => {
    setSaving(true);
    const next = await api.putSettings({ rateLimit: config });
    onSaved(next);
    setSaving(false);
  };

  const reset = async () => {
    const r = await api.resetMyUsage();
    setUsage(r.usage);
  };

  return (
    <Stack>
      <SectionHeader>{s.ui_ratelimit_limits}</SectionHeader>
      <RateLimitFields value={config} onChange={setConfig} />
      <SectionFooter>{s.ui_ratelimit_footer}</SectionFooter>

      <SaveButton saving={saving} dirty={dirty} onClick={save} />

      <SectionHeader>{s.ui_ratelimit_my_usage}</SectionHeader>
      {usage ? (
        <>
          <UsageCard usage={usage} />
          <Card>
            <RowButton onClick={reset}>{s.ui_ratelimit_reset}</RowButton>
          </Card>
        </>
      ) : null}
    </Stack>
  );
}
