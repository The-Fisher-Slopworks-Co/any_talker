// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useState } from "react";
import { useI18n } from "../i18n-context";
import { useDateFmt } from "../datetime-context";
import type { Settings } from "../../../shared/types";
import type { SettingsPatch } from "../api-client/settings";
import { activeBoost, MAX_BOOST_PERCENT } from "../../../ratelimit/boost";
import {
  localDateTimeString,
  parseAbsoluteDateTimeMs,
} from "../../../shared/tz";
import { ActionRow } from "./controls";
import { Card } from "./layout";
import { NumberRow } from "./number-row";
import { ROW_CLS, ROW_LABEL_CLS, ROW_VALUE_CLS } from "./row";

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

// The "until" field as an iOS date pill in the value position: the short date
// is the pill's text and the native picker is laid invisibly over it, so the
// pill is as wide as that text whatever size the browser gives the input. The
// pill sits inside the row's <label>, so "Until" names the input.
const DATE_PILL_CLS =
  "relative min-w-0 rounded-lg bg-[var(--tg-separator)] px-3 py-1 text-base text-tg-text";
const PICKER_CLS = "absolute inset-0 h-full w-full min-w-0 opacity-0";

// A tap on the invisible input opens the picker on desktop too, where it
// would otherwise only focus a segment of the field.
function openPicker(input: HTMLInputElement) {
  try {
    input.showPicker?.();
  } catch {
    // The browser refuses outside a user gesture; the field still works typed.
  }
}

// Admin control for the "+X% to limits until <date>" promo: the running one
// as read-only rows with a way to end it early, or the rows to start one (one
// at a time). Starting and ending save at once.
export function LimitBoostCard({
  boost,
  save,
}: {
  boost: Settings["limitBoost"];
  save: (patch: SettingsPatch) => void;
}) {
  const { t: s } = useI18n();
  const { short, timezone } = useDateFmt();
  const tz = timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [percent, setPercent] = useState(50);
  const [until, setUntil] = useState(() =>
    localDateTimeString(Date.now() + TWO_WEEKS_MS, tz).replace(" ", "T"),
  );
  const [invalid, setInvalid] = useState(false);
  const untilParsed = parseAbsoluteDateTimeMs(until, tz);

  const start = () => {
    if (!untilParsed.ok || untilParsed.ms <= Date.now()) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    save({ limitBoost: { percent, untilMs: untilParsed.ms } });
  };

  const end = () => {
    if (confirm(s.ui_boost_end_confirm)) save({ limitBoost: null });
  };

  const active = activeBoost(boost, Date.now());
  if (active) {
    return (
      <Card>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_boost_status}</span>
          <span className="flex-1 text-right text-base text-[#34c759]">
            {s.ui_boost_status_active}
          </span>
        </div>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_boost_percent}</span>
          <span className={ROW_VALUE_CLS}>+{active.percent}%</span>
        </div>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_boost_until}</span>
          <span className={ROW_VALUE_CLS}>{short(active.untilMs)}</span>
        </div>
        <ActionRow destructive onClick={end}>
          {s.ui_boost_end}
        </ActionRow>
      </Card>
    );
  }

  return (
    <Card>
      <NumberRow
        label={s.ui_boost_percent}
        suffix="%"
        integer
        min={1}
        max={MAX_BOOST_PERCENT}
        value={percent}
        onCommit={setPercent}
      />
      <label className={ROW_CLS}>
        <span className={ROW_LABEL_CLS}>{s.ui_boost_until}</span>
        <span className="flex-1" />
        <span className={DATE_PILL_CLS}>
          {untilParsed.ok ? short(untilParsed.ms) : "–"}
          <input
            type="datetime-local"
            className={PICKER_CLS}
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            onClick={(e) => openPicker(e.currentTarget)}
          />
        </span>
      </label>
      {invalid ? (
        <div className="px-4 pb-2 text-[13px] text-tg-destructive">
          {s.ui_boost_until_invalid}
        </div>
      ) : null}
      <ActionRow bold disabled={until === ""} onClick={start}>
        {s.ui_boost_start}
      </ActionRow>
    </Card>
  );
}
