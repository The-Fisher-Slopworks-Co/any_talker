// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n-context";
import { useDateFmt } from "../datetime-context";
import { api, type UsageStatus } from "../api-client";
import { LIMIT_CLASSES, type LimitClass } from "../../../shared/types";
import type { WindowStatus } from "../../../ratelimit/window";
import { formatUsd } from "../lib/labels";
import { useAutosave } from "../lib/use-autosave";
import { ActionRow } from "./controls";
import { Card, SectionFooter, SectionHeader } from "./layout";
import { ROW_CLS, ROW_LABEL_CLS, ROW_VALUE_CLS } from "./row";
import { SaveStatus } from "./save-status";
import { UsageMeter } from "./usage-header";
import { ValueSelectRow } from "./value-select-row";

// Share of the window's budget spent. Rounds like `ratelimit/share.ts` (any
// spend shows as at least 1%) but is not capped at 100, so an overrun stays
// visible to the admin.
export function usedPercent(w: WindowStatus): number {
  if (w.limit <= 0) return 100;
  const raw = (w.used / w.limit) * 100;
  const rounded = raw > 0 && raw < 1 ? 1 : Math.round(raw);
  return Math.max(0, rounded);
}

// `<select>` values are strings, so "no class" (null) travels as "".
const NO_CLASS = "";

type Change = { limitClass: LimitClass | null } | "reset";
type Saved = { usage: UsageStatus; limitClass?: LimitClass | null };

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

// A user's rate-limit windows, their limit class and a way to start the
// windows over, in one card. A class pick saves at once (and refetches the
// windows it moves); a rejected one goes back to the last saved class.
export function UserLimitsSection({
  userId,
  initialClass,
  allowanceMonthUsd,
}: {
  userId: string;
  initialClass: LimitClass | null;
  // Drawn from the class allowance this UTC calendar month.
  allowanceMonthUsd: number;
}) {
  const { t: s } = useI18n();
  const [usage, setUsage] = useState<UsageStatus | null>(null);
  const [limitClass, setLimitClass] = useState(initialClass);
  const [savedClass, setSavedClass] = useState(initialClass);
  // The class change queued last. A refused one only goes back when no newer
  // one has been queued since, or it would undo that one on screen.
  const queued = useRef<Change | null>(null);

  useEffect(() => {
    void api.getUserUsage(userId).then((r) => setUsage(r.usage));
  }, [userId]);

  const { save, status } = useAutosave<Change, Saved>({
    send: async (change) => {
      if (change === "reset")
        return { usage: (await api.resetUserUsage(userId)).usage };
      const put = await api.putUserLimitClass(userId, change.limitClass);
      return {
        limitClass: put.limitClass,
        usage: (await api.getUserUsage(userId)).usage,
      };
    },
    onSaved: (r) => {
      setUsage(r.usage);
      if (r.limitClass !== undefined) setSavedClass(r.limitClass);
    },
    onFailed: (change) => {
      if (change !== "reset" && change === queued.current)
        setLimitClass(savedClass);
    },
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
        <ValueSelectRow
          label={s.ui_limit_class_header}
          value={limitClass === null ? NO_CLASS : String(limitClass)}
          onChange={(v) => {
            const next = LIMIT_CLASSES.find((c) => String(c) === v) ?? null;
            const change = { limitClass: next };
            queued.current = change;
            setLimitClass(next);
            save(change);
          }}
        >
          <option value={NO_CLASS}>{s.ui_limit_class_none}</option>
          {LIMIT_CLASSES.map((c) => (
            <option key={c} value={c}>
              {s.ui_limit_class_name(c)}
            </option>
          ))}
        </ValueSelectRow>
        {limitClass !== null || allowanceMonthUsd > 0 ? (
          <div className={ROW_CLS}>
            <span className={ROW_LABEL_CLS}>
              {s.ui_limit_class_allowance_spent}
            </span>
            <span className={ROW_VALUE_CLS}>
              {formatUsd(allowanceMonthUsd)}
            </span>
          </div>
        ) : null}
        <ActionRow onClick={() => save("reset")}>
          {s.ui_ratelimit_reset}
        </ActionRow>
      </Card>
      <SectionFooter>{s.ui_limit_class_footer}</SectionFooter>
      <SaveStatus status={status} />
    </>
  );
}
