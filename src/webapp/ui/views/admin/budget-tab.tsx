// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useState } from "react";
import { useI18n } from "../../i18n-context";
import { api } from "../../api-client";
import type {
  AnomalyConfig,
  BudgetConfig,
  Settings,
} from "../../../../shared/types";
import {
  Card,
  SectionFooter,
  SectionHeader,
  Stack,
} from "../../components/layout";
import { NumberInput, SaveButton, Toggle } from "../../components/controls";
import { INPUT_CLS, ROW_CLS, ROW_LABEL_CLS } from "../../components/row";

function NumRow({
  label,
  value,
  onChange,
  step,
  min = 0,
  integer,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step?: string;
  min?: number;
  integer?: boolean;
}) {
  return (
    <label className={ROW_CLS}>
      <span className={ROW_LABEL_CLS}>{label}</span>
      <NumberInput
        className={INPUT_CLS}
        integer={integer}
        step={step}
        min={min}
        value={value}
        onChange={onChange}
      />
    </label>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className={ROW_CLS}>
      <span className={ROW_LABEL_CLS}>{label}</span>
      <span className="flex-1" />
      <Toggle value={value} onChange={onChange} />
    </div>
  );
}

export function BudgetTab({
  settings,
  onSaved,
}: {
  settings: Settings;
  onSaved: (s: Settings) => void;
}) {
  const { t: s } = useI18n();
  const [budget, setBudget] = useState<BudgetConfig>(settings.budget);
  const [anomaly, setAnomaly] = useState<AnomalyConfig>(settings.anomaly);
  const [saving, setSaving] = useState(false);

  const dirty =
    JSON.stringify(budget) !== JSON.stringify(settings.budget) ||
    JSON.stringify(anomaly) !== JSON.stringify(settings.anomaly);

  const save = async () => {
    setSaving(true);
    const next = await api.putSettings({ budget, anomaly });
    onSaved(next);
    setSaving(false);
  };

  const b = (patch: Partial<BudgetConfig>) => setBudget({ ...budget, ...patch });
  const a = (patch: Partial<AnomalyConfig>) =>
    setAnomaly({ ...anomaly, ...patch });

  return (
    <Stack>
      <SectionHeader>{s.ui_budget_caps_header}</SectionHeader>
      <Card>
        <ToggleRow
          label={s.ui_budget_enabled}
          value={budget.enabled}
          onChange={(v) => b({ enabled: v })}
        />
        <ToggleRow
          label={s.ui_budget_owner_exempt}
          value={budget.ownerExempt}
          onChange={(v) => b({ ownerExempt: v })}
        />
        <NumRow
          label={s.ui_budget_global_monthly}
          step="0.5"
          value={budget.globalMonthlyCapUsd}
          onChange={(n) => b({ globalMonthlyCapUsd: n })}
        />
        <NumRow
          label={s.ui_budget_global_daily}
          step="0.5"
          value={budget.globalDailyCapUsd}
          onChange={(n) => b({ globalDailyCapUsd: n })}
        />
        <NumRow
          label={s.ui_budget_per_chat_daily}
          step="0.5"
          value={budget.perChatDailyCapUsd}
          onChange={(n) => b({ perChatDailyCapUsd: n })}
        />
        <NumRow
          label={s.ui_budget_new_user_daily}
          step="0.05"
          value={budget.newUserDailyCapUsd}
          onChange={(n) => b({ newUserDailyCapUsd: n })}
        />
        <NumRow
          label={s.ui_budget_new_user_window}
          integer
          min={1}
          value={budget.newUserWindowDays}
          onChange={(n) => b({ newUserWindowDays: n })}
        />
      </Card>
      <SectionFooter>{s.ui_budget_caps_footer}</SectionFooter>

      <SectionHeader>{s.ui_budget_anomaly_header}</SectionHeader>
      <Card>
        <NumRow
          label={s.ui_budget_digest_interval}
          integer
          min={1}
          value={anomaly.digestIntervalHours}
          onChange={(n) => a({ digestIntervalHours: n })}
        />
        <NumRow
          label={s.ui_budget_spike_user_abs}
          step="0.1"
          value={anomaly.spikeUserAbsoluteUsd}
          onChange={(n) => a({ spikeUserAbsoluteUsd: n })}
        />
        <NumRow
          label={s.ui_budget_spike_chat_abs}
          step="0.1"
          value={anomaly.spikeChatAbsoluteUsd}
          onChange={(n) => a({ spikeChatAbsoluteUsd: n })}
        />
        <NumRow
          label={s.ui_budget_spike_velocity}
          step="0.5"
          min={1}
          value={anomaly.spikeVelocityMultiplier}
          onChange={(n) => a({ spikeVelocityMultiplier: n })}
        />
        <NumRow
          label={s.ui_budget_spike_min_baseline}
          step="0.01"
          value={anomaly.spikeMinBaselineUsd}
          onChange={(n) => a({ spikeMinBaselineUsd: n })}
        />
      </Card>
      <SectionFooter>{s.ui_budget_anomaly_footer}</SectionFooter>

      <SaveButton saving={saving} dirty={dirty} onClick={save} />
    </Stack>
  );
}
