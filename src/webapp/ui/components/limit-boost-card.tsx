// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useState } from "react";
import { useI18n } from "../i18n-context";
import { useDateFmt } from "../datetime-context";
import { api } from "../api-client";
import type { Settings } from "../../../shared/types";
import { activeBoost, MAX_BOOST_PERCENT } from "../../../ratelimit/boost";
import {
  localDateTimeString,
  parseAbsoluteDateTimeMs,
} from "../../../shared/tz";
import { Card } from "./layout";
import { DeleteButton, NumberInput, RowButton } from "./controls";
import { INPUT_CLS, ROW_CLS, ROW_LABEL_CLS } from "./row";

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

// Admin control for the "+X% to limits until <date>" promo: the running one
// with a button to end it early, or a form to start one (one at a time).
export function LimitBoostCard({
  settings,
  onSaved,
}: {
  settings: Settings;
  onSaved: (s: Settings) => void;
}) {
  const { t: s } = useI18n();
  const { format, timezone } = useDateFmt();
  const tz = timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [percent, setPercent] = useState(50);
  const [until, setUntil] = useState(() =>
    localDateTimeString(Date.now() + TWO_WEEKS_MS, tz).replace(" ", "T"),
  );
  const [busy, setBusy] = useState(false);
  const [invalid, setInvalid] = useState(false);

  const save = async (limitBoost: Settings["limitBoost"]) => {
    setBusy(true);
    try {
      onSaved(await api.putSettings({ limitBoost }));
    } finally {
      setBusy(false);
    }
  };

  const start = () => {
    const parsed = parseAbsoluteDateTimeMs(until, tz);
    if (!parsed.ok || parsed.ms <= Date.now()) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    void save({ percent, untilMs: parsed.ms });
  };

  const active = activeBoost(settings.limitBoost, Date.now());
  if (active) {
    return (
      <>
        <Card>
          <div className={ROW_CLS}>
            <span className={ROW_LABEL_CLS}>
              {s.ui_boost_active(active.percent, format(active.untilMs))}
            </span>
          </div>
        </Card>
        <Card>
          <DeleteButton disabled={busy} onClick={() => void save(null)}>
            {s.ui_boost_end}
          </DeleteButton>
        </Card>
      </>
    );
  }

  return (
    <>
      <Card>
        <label className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_boost_percent}</span>
          <NumberInput
            className={INPUT_CLS}
            integer
            min={1}
            max={MAX_BOOST_PERCENT}
            value={percent}
            onChange={setPercent}
          />
        </label>
        <label className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_boost_until}</span>
          <input
            type="datetime-local"
            className={INPUT_CLS}
            value={until}
            onChange={(e) => setUntil(e.target.value)}
          />
        </label>
        {invalid ? (
          <div className="px-4 pb-2 text-[13px] text-tg-destructive">
            {s.ui_boost_until_invalid}
          </div>
        ) : null}
      </Card>
      <Card>
        <RowButton disabled={busy || until === ""} onClick={start}>
          {s.ui_boost_start}
        </RowButton>
      </Card>
    </>
  );
}
