// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../i18n-context";
import { Card } from "./layout";
import { NumberRow } from "./number-row";

// The per-user reminder cap (`Settings.maxRemindersPerUser`). Split from its
// tab like `RateLimitFields` is, so the field can be rendered without the API
// client behind it.
export function ReminderCapField({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (n: number) => void;
}) {
  const { t: s } = useI18n();
  return (
    <Card>
      <NumberRow
        label={s.ui_reminders_cap_label}
        integer
        min={1}
        value={value}
        onCommit={onCommit}
      />
    </Card>
  );
}
