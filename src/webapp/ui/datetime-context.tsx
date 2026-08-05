// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { formatDateTime } from "../../shared/date-format";

// Every timestamp the Web App renders goes through this context, so the
// viewer's own preferences apply uniformly: `dateFormat` (null = the device
// locale) and `timezone` (the profile override; null = the device timezone).
type DateFmtValue = {
  format: (ms: number) => string;
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
  const value = useMemo<DateFmtValue>(
    () => ({
      format: (ms: number) => formatDateTime(ms, dateFormat, timezone),
      timezone,
    }),
    [dateFormat, timezone],
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
