// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../i18n-context";
import type { UsageShare, WindowShare } from "../../../ratelimit/share";

// Fill colour by how much of the window is gone — green-ish default, amber as
// it tightens, destructive once the ceiling is in sight. Thresholds are on the
// *used* share so the bar reads the same way as the number beside it.
function fillColor(usedPercent: number): string {
  if (usedPercent >= 90) return "var(--color-tg-destructive)";
  if (usedPercent >= 70) return "#ff9500";
  return "var(--color-tg-button)";
}

function WindowBar({ label, share }: { label: string; share: WindowShare }) {
  const { t: s } = useI18n();
  const now = Date.now();
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium">{label}</span>
        <span className="text-[13px] tabular-nums text-tg-hint">
          {s.ui_usage_header_left(share.remainingPercent)} ·{" "}
          {s.ui_usage_header_resets(Math.max(0, share.resetMs - now))}
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: "var(--tg-separator)" }}
        role="progressbar"
        aria-label={label}
        aria-valuenow={share.usedPercent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full transition-[width] duration-300 ease-tg-spring"
          style={{
            width: `${share.usedPercent}%`,
            background: fillColor(share.usedPercent),
          }}
        />
      </div>
    </div>
  );
}

// The Web App's top header: how much of the viewer's own 5-hour and weekly
// budget is left, as two progress bars. Percentage-only by construction — it is
// handed a `UsageShare`, which carries no token counts at all (see
// `ratelimit/share.ts`), so the same rule the `/usage` command follows holds
// here. Renders nothing until the fetch lands, so the layout below it doesn't
// jump twice.
export function UsageHeader({ usage }: { usage: UsageShare | null }) {
  const { t: s } = useI18n();
  if (!usage) return null;
  return (
    <div className="mb-3 rounded-xl bg-tg-section px-4 py-3">
      <div className="pb-2 text-[13px] font-medium text-tg-section-header">
        {s.ui_usage_header_title}
      </div>
      {usage.exempt ? (
        <div className="text-[13px] text-tg-hint">
          {s.ui_usage_header_exempt}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          <WindowBar label={s.ui_usage_header_5h} share={usage.fiveHour} />
          <WindowBar label={s.ui_usage_header_weekly} share={usage.weekly} />
        </div>
      )}
    </div>
  );
}
