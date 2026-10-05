// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { ReactNode } from "react";
import { useI18n } from "../i18n-context";
import { useDateFmt } from "../datetime-context";
import type { UsageShare, WindowShare } from "../../../ratelimit/share";
import { Card, SectionFooter, SectionHeader } from "./layout";

// Fill colour by how much of the window is gone — green-ish default, amber as
// it tightens, destructive once the ceiling is in sight. Thresholds are on the
// *used* share so the bar reads the same way as the number beside it.
function fillColor(usedPercent: number): string {
  if (usedPercent >= 90) return "var(--color-tg-destructive)";
  if (usedPercent >= 70) return "#ff9500";
  return "var(--color-tg-button)";
}

// One limit window as a card row: its name and a figure, a progress bar and a
// caption underneath. The bar never overflows, even when the figure does.
export function UsageMeter({
  label,
  value,
  usedPercent,
  caption,
}: {
  label: string;
  value: string;
  usedPercent: number;
  caption: ReactNode;
}) {
  const filled = Math.min(100, usedPercent);
  return (
    <div className="row relative flex flex-col gap-2 px-4 py-[11px]">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[17px]">{label}</span>
        <span className="text-[17px] tabular-nums text-tg-hint">{value}</span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: "var(--tg-fill)" }}
        role="progressbar"
        aria-label={label}
        aria-valuenow={filled}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full transition-[width] duration-300 ease-tg-spring"
          style={{ width: `${filled}%`, background: fillColor(usedPercent) }}
        />
      </div>
      <span className="text-[13px] leading-[18px] text-tg-hint">{caption}</span>
    </div>
  );
}

function WindowBar({ label, share }: { label: string; share: WindowShare }) {
  const { t: s } = useI18n();
  return (
    <UsageMeter
      label={label}
      value={s.ui_usage_header_left(share.remainingPercent)}
      usedPercent={share.usedPercent}
      caption={s.ui_usage_header_resets(
        Math.max(0, share.resetMs - Date.now()),
      )}
    />
  );
}

// The settings home's top header (see `showsUsageHeader` in `lib/routes.ts`):
// how much of the viewer's own 5-hour and weekly budget is left, as two
// progress bars. Percentage-only by construction — it is
// handed a `UsageShare`, which carries no token counts at all (see
// `ratelimit/share.ts`), so the same rule the `/usage` command follows holds
// here. Renders nothing until the fetch lands, so the layout below it doesn't
// jump twice.
export function UsageHeader({ usage }: { usage: UsageShare | null }) {
  const { t: s } = useI18n();
  const { format } = useDateFmt();
  if (!usage) return null;
  return (
    <div className="pb-[35px]">
      <SectionHeader>{s.ui_usage_header_title}</SectionHeader>
      <div className="pt-2">
        <Card>
          {usage.exempt ? (
            <div className="px-4 py-[11px] text-tg-hint">
              {s.ui_usage_header_exempt}
            </div>
          ) : (
            <>
              <WindowBar label={s.ui_usage_header_5h} share={usage.fiveHour} />
              <WindowBar
                label={s.ui_usage_header_weekly}
                share={usage.weekly}
              />
            </>
          )}
        </Card>
      </div>
      {!usage.exempt && usage.boost ? (
        <SectionFooter>
          {s.ui_usage_header_boost(
            usage.boost.percent,
            format(usage.boost.untilMs),
          )}
        </SectionFooter>
      ) : null}
    </div>
  );
}
