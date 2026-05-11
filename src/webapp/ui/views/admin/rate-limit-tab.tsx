// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useEffect, useState } from "react";
import { useI18n } from "../../i18n-context";
import { api } from "../../api-client";
import type {
  BucketState,
  RateLimitConfig,
  Settings,
} from "../../../../shared/types";
import {
  Card,
  SectionFooter,
  SectionHeader,
  Stack,
} from "../../components/layout";
import { RowButton, SaveButton } from "../../components/controls";
import { EmptyState } from "../../components/states";
import { RateLimitFields } from "../../components/rate-limit-fields";
import {
  ROW_CLS,
  ROW_LABEL_CLS,
  ROW_VALUE_CLS,
} from "../../components/row";

export function RateLimitTab({
  settings,
  onSaved,
}: {
  settings: Settings;
  onSaved: (s: Settings) => void;
}) {
  const { t: s } = useI18n();
  const [config, setConfig] = useState<RateLimitConfig>(settings.rateLimit);
  const [bucket, setBucket] = useState<BucketState | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getMyBucket().then((r) => setBucket(r.bucket));
  }, []);

  const dirty =
    config.capacity !== settings.rateLimit.capacity ||
    config.refillAmount !== settings.rateLimit.refillAmount ||
    config.refillIntervalMs !== settings.rateLimit.refillIntervalMs ||
    config.ownerExempt !== settings.rateLimit.ownerExempt;

  const save = async () => {
    setSaving(true);
    const next = await api.putSettings({ rateLimit: config });
    onSaved(next);
    setSaving(false);
  };

  const reset = async () => {
    const r = await api.resetMyBucket();
    setBucket(r.bucket);
  };

  return (
    <Stack>
      <SectionHeader>{s.ui_ratelimit_limits}</SectionHeader>
      <RateLimitFields value={config} onChange={setConfig} />
      <SectionFooter>{s.ui_ratelimit_footer}</SectionFooter>

      <SaveButton saving={saving} dirty={dirty} onClick={save} />

      <SectionHeader>{s.ui_ratelimit_my_bucket}</SectionHeader>
      <Card>
        {bucket ? (
          <>
            <div className={ROW_CLS}>
              <span className={ROW_LABEL_CLS}>{s.ui_ratelimit_tokens}</span>
              <span className={ROW_VALUE_CLS}>
                {bucket.tokens.toLocaleString()} /{" "}
                {config.capacity.toLocaleString()}
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
            <RowButton onClick={reset}>{s.ui_ratelimit_reset}</RowButton>
          </>
        ) : (
          <EmptyState>{s.ui_ratelimit_no_bucket}</EmptyState>
        )}
      </Card>
    </Stack>
  );
}
