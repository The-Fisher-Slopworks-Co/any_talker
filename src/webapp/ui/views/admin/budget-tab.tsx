// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../../i18n-context";
import type { Settings } from "../../../../shared/types";
import {
  Card,
  SectionFooter,
  SectionHeader,
  Stack,
} from "../../components/layout";
import { NumberRow } from "../../components/number-row";
import { SaveStatus } from "../../components/save-status";
import { SwitchRow } from "../../components/switch-row";
import { useSettingsAutosave } from "../../lib/use-settings-autosave";

export function BudgetTab({
  settings,
  onSaved,
}: {
  settings: Settings;
  onSaved: (s: Settings) => void;
}) {
  const { t: s } = useI18n();
  const { draft, save, status } = useSettingsAutosave({ settings, onSaved });
  const { budget, anomaly } = draft;

  return (
    <Stack>
      <Card>
        <SwitchRow
          label={s.ui_budget_enabled}
          value={budget.enabled}
          onChange={(enabled) => save({ budget: { enabled } })}
        />
        <SwitchRow
          label={s.ui_budget_owner_exempt}
          value={budget.ownerExempt}
          onChange={(ownerExempt) => save({ budget: { ownerExempt } })}
        />
      </Card>

      <SectionHeader>{s.ui_budget_caps_header}</SectionHeader>
      <Card>
        <NumberRow
          label={s.ui_budget_global_monthly}
          prefix="$"
          decimals={2}
          step="0.5"
          min={0}
          value={budget.globalMonthlyCapUsd}
          onCommit={(globalMonthlyCapUsd) =>
            save({ budget: { globalMonthlyCapUsd } })
          }
        />
        <NumberRow
          label={s.ui_budget_global_daily}
          prefix="$"
          decimals={2}
          step="0.5"
          min={0}
          value={budget.globalDailyCapUsd}
          onCommit={(globalDailyCapUsd) =>
            save({ budget: { globalDailyCapUsd } })
          }
        />
        <NumberRow
          label={s.ui_budget_per_chat_daily}
          prefix="$"
          decimals={2}
          step="0.5"
          min={0}
          value={budget.perChatDailyCapUsd}
          onCommit={(perChatDailyCapUsd) =>
            save({ budget: { perChatDailyCapUsd } })
          }
        />
        <NumberRow
          label={s.ui_budget_new_user_daily}
          prefix="$"
          decimals={2}
          step="0.05"
          min={0}
          value={budget.newUserDailyCapUsd}
          onCommit={(newUserDailyCapUsd) =>
            save({ budget: { newUserDailyCapUsd } })
          }
        />
        <NumberRow
          label={s.ui_budget_new_user_window}
          suffix={s.ui_budget_unit_days}
          integer
          min={1}
          value={budget.newUserWindowDays}
          onCommit={(newUserWindowDays) =>
            save({ budget: { newUserWindowDays } })
          }
        />
      </Card>
      <SectionFooter>{s.ui_budget_caps_footer}</SectionFooter>

      <SectionHeader>{s.ui_budget_digest_header}</SectionHeader>
      <Card>
        <SwitchRow
          label={s.ui_budget_digest_enabled}
          value={anomaly.digestEnabled}
          onChange={(digestEnabled) => save({ anomaly: { digestEnabled } })}
        />
        {anomaly.digestEnabled && (
          <NumberRow
            label={s.ui_budget_digest_interval}
            suffix={s.ui_budget_unit_hours}
            integer
            min={1}
            value={anomaly.digestIntervalHours}
            onCommit={(digestIntervalHours) =>
              save({ anomaly: { digestIntervalHours } })
            }
          />
        )}
      </Card>

      <SectionHeader>{s.ui_budget_anomaly_header}</SectionHeader>
      <Card>
        <NumberRow
          label={s.ui_budget_spike_user_abs}
          prefix="$"
          suffix={s.ui_budget_unit_per_day}
          decimals={2}
          step="0.1"
          min={0}
          value={anomaly.spikeUserAbsoluteUsd}
          onCommit={(spikeUserAbsoluteUsd) =>
            save({ anomaly: { spikeUserAbsoluteUsd } })
          }
        />
        <NumberRow
          label={s.ui_budget_spike_chat_abs}
          prefix="$"
          suffix={s.ui_budget_unit_per_day}
          decimals={2}
          step="0.1"
          min={0}
          value={anomaly.spikeChatAbsoluteUsd}
          onCommit={(spikeChatAbsoluteUsd) =>
            save({ anomaly: { spikeChatAbsoluteUsd } })
          }
        />
        <NumberRow
          label={s.ui_budget_spike_velocity}
          suffix={s.ui_budget_unit_baseline}
          step="0.5"
          min={1}
          value={anomaly.spikeVelocityMultiplier}
          onCommit={(spikeVelocityMultiplier) =>
            save({ anomaly: { spikeVelocityMultiplier } })
          }
        />
        <NumberRow
          label={s.ui_budget_spike_min_baseline}
          prefix="$"
          decimals={2}
          step="0.01"
          min={0}
          value={anomaly.spikeMinBaselineUsd}
          onCommit={(spikeMinBaselineUsd) =>
            save({ anomaly: { spikeMinBaselineUsd } })
          }
        />
      </Card>
      <SectionFooter>{s.ui_budget_anomaly_footer}</SectionFooter>

      <SaveStatus status={status} />
    </Stack>
  );
}
