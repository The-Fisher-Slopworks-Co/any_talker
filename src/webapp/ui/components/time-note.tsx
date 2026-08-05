// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../i18n-context";
import { useDateFmt } from "../datetime-context";

// Inline disclaimer naming the timezone the surrounding timestamps are shown
// in. Rendered next to (or as) a SectionFooter in every view with timestamps.
export function TimeNote() {
  const { t: s } = useI18n();
  const { timezone } = useDateFmt();
  return <>{timezone ? s.ui_time_note_tz(timezone) : s.ui_time_note_local}</>;
}
