// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../i18n-context";
import { useDateFmt } from "../datetime-context";
import { api, type UsageStatus } from "../api-client";
import type { WindowStatus } from "../../../ratelimit/window";
import { useAutosave } from "../lib/use-autosave";
import { ActionRow } from "./controls";
import { Card, SectionHeader } from "./layout";
import { SaveStatus } from "./save-status";
import { UsageMeter } from "./usage-header";

// Share of the window's budget spent. Rounds like `ratelimit/share.ts` (any
// spend shows as at least 1%) but is not capped at 100, so an overrun stays
// visible to the admin.
export function usedPercent(w: WindowStatus): number {
  if (w.limit <= 0) return 100;
  const raw = (w.used / w.limit) * 100;
  const rounded = raw > 0 && raw < 1 ? 1 : Math.round(raw);
  return Math.max(0, rounded);
}

function WindowMeter({ label, w }: { label: string; w: WindowStatus }) {
  const { t: s } = useI18n();
  const { short } = useDateFmt();
  const percent = usedPercent(w);
  return (
    <UsageMeter
      label={label}
      value={s.ui_limit_used(percent)}
      usedPercent={percent}
      caption={
        // A label and its value: `short` yields a capitalised standalone
        // date, which does not belong inside a phrase.
        <span className="flex justify-between gap-3">
          <span>{s.ui_ratelimit_resets}</span>
          <span>{short(w.resetMs)}</span>
        </span>
      }
    />
  );
}

// A user's two rate-limit windows as progress bars, with a way to start them
// over. Showing nothing but the action while the windows load keeps the card
// from jumping.
export function UserLimitsSection({
  userId,
  usage,
  onUsage,
}: {
  userId: string;
  usage: UsageStatus | null;
  onUsage: (usage: UsageStatus) => void;
}) {
  const { t: s } = useI18n();
  const { save, status } = useAutosave<"reset", UsageStatus>({
    send: async () => (await api.resetUserUsage(userId)).usage,
    onSaved: onUsage,
    onFailed: () => {},
  });

  return (
    <>
      <SectionHeader>{s.ui_usage_header_title}</SectionHeader>
      <Card>
        {usage ? (
          <>
            <WindowMeter label={s.ui_ratelimit_5h_window} w={usage.fiveHour} />
            <WindowMeter
              label={s.ui_ratelimit_weekly_window}
              w={usage.weekly}
            />
          </>
        ) : null}
        <ActionRow onClick={() => save("reset")}>
          {s.ui_ratelimit_reset}
        </ActionRow>
      </Card>
      <SaveStatus status={status} />
    </>
  );
}
