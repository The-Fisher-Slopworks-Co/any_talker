// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../../i18n-context";
import { api } from "../../api-client";
import type { Settings } from "../../../../shared/types";
import { SectionFooter, Stack } from "../../components/layout";
import { ReminderCapField } from "../../components/reminder-cap-field";
import { SaveStatus } from "../../components/save-status";
import { useSettingsAutosave } from "../../lib/use-settings-autosave";
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
  const { draft, save, status } = useSettingsAutosave({ settings, onSaved });

  return (
    <Stack>
      <ReminderCapField
        value={draft.maxRemindersPerUser}
        onCommit={(maxRemindersPerUser) => save({ maxRemindersPerUser })}
      />
      <SectionFooter>{s.ui_reminders_cap_footer}</SectionFooter>

      {/* The list is a Stack of its own, so its header is not a sibling of
          the footer above and needs the gap spelled out. */}
      <div className="section-gap">
        <RemindersList
          fetchReminders={api.listAdminReminders}
          header={s.ui_reminders_admin_header}
          emptyText={s.ui_reminders_admin_empty}
          footer={s.ui_reminders_admin_footer}
          onUserClick={onUserClick}
          editable={true}
        />
      </div>
      <SaveStatus status={status} />
    </Stack>
  );
}
