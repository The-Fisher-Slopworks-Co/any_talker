// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { formatDateTime, formatShortDateTime } from "../../shared/date-format";
import { useI18n } from "./i18n-context";

// Every timestamp the Web App renders goes through this context, so the
// viewer's own preferences apply uniformly: `dateFormat` (null = the device
// locale) and `timezone` (the profile override; null = the device timezone).
type DateFmtValue = {
  format: (ms: number) => string;
  // "Today, 19:39" / "Oct 6, 16:39" / "Oct 6, 2025" — the compact form lists
  // use. Only ever a standalone value (a row's value, a subtitle part): the
  // capitalised day word cannot sit inside a sentence ("Created Today, …").
  short: (ms: number) => string;
  timezone: string | null;
};

const DateFmtContext = createContext<DateFmtValue | null>(null);

export function DateFmtProvider({
  dateFormat,
  timezone,
  children,
}: {
  dateFormat: string | null;
  timezone: string | null;
  children: ReactNode;
}) {
  const { t: s } = useI18n();
  const value = useMemo<DateFmtValue>(
    () => ({
      format: (ms: number) => formatDateTime(ms, dateFormat, timezone),
      short: (ms: number) =>
        formatShortDateTime(ms, Date.now(), dateFormat, timezone, {
          today: s.ui_date_today,
          yesterday: s.ui_date_yesterday,
          tomorrow: s.ui_date_tomorrow,
        }),
      timezone,
    }),
    [dateFormat, timezone, s],
  );
  return (
    <DateFmtContext.Provider value={value}>{children}</DateFmtContext.Provider>
  );
}

export function useDateFmt(): DateFmtValue {
  const value = useContext(DateFmtContext);
  if (!value) throw new Error("useDateFmt used outside DateFmtProvider");
  return value;
}
