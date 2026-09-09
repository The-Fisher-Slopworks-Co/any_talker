// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../i18n-context";
import { Card } from "./layout";
import { NumberInput } from "./controls";
import { INPUT_CLS, ROW_CLS, ROW_LABEL_CLS } from "./row";

// The per-user reminder cap (`Settings.maxRemindersPerUser`). Split from its
// tab like `RateLimitFields` is, so the field can be rendered without the API
// client behind it.
export function ReminderCapField({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  const { t: s } = useI18n();
  return (
    <Card>
      <label className={ROW_CLS}>
        <span className={ROW_LABEL_CLS}>{s.ui_reminders_cap_label}</span>
        <NumberInput
          className={INPUT_CLS}
          integer
          min={1}
          value={value}
          onChange={onChange}
        />
      </label>
    </Card>
  );
}
