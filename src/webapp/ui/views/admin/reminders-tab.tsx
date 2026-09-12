// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useState } from "react";
import { useI18n } from "../../i18n-context";
import { api } from "../../api-client";
import type { Settings } from "../../../../shared/types";
import { SectionFooter, SectionHeader, Stack } from "../../components/layout";
import { SaveButton } from "../../components/controls";
import { ReminderCapField } from "../../components/reminder-cap-field";
import { RemindersList } from "../reminders-list";

// The admin reminders section: the per-user cap that governs how many of the
// rows below one user may hold, and then the rows themselves.
export function RemindersTab({
  settings,
  onSaved,
  onUserClick,
}: {
  settings: Settings;
  onSaved: (s: Settings) => void;
  onUserClick: (userId: string) => void;
}) {
  const { t: s } = useI18n();
  const [cap, setCap] = useState(settings.maxRemindersPerUser);
  const [saving, setSaving] = useState(false);

  const dirty = cap !== settings.maxRemindersPerUser;
  // NumberInput only clamps to `min` on blur, so a half-typed "0" reaches this
  // state; the API rejects anything below 1, so keep Save off until it is one.
  const canSave = dirty && Number.isInteger(cap) && cap >= 1;

  const save = async () => {
    setSaving(true);
    try {
      const next = await api.putSettings({ maxRemindersPerUser: cap });
      onSaved(next);
      setCap(next.maxRemindersPerUser);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack>
      <SectionHeader>{s.ui_reminders_cap_header}</SectionHeader>
      <ReminderCapField value={cap} onChange={setCap} />
      <SectionFooter>{s.ui_reminders_cap_footer}</SectionFooter>
      <SaveButton
        saving={saving}
        dirty={dirty}
        disabled={saving || !canSave}
        onClick={save}
      />

      <RemindersList
        fetchReminders={api.listAdminReminders}
        header={s.ui_reminders_admin_header}
        emptyText={s.ui_reminders_admin_empty}
        footer={s.ui_reminders_admin_footer}
        showUserId={true}
        onUserClick={onUserClick}
        editable={true}
      />
    </Stack>
  );
}
