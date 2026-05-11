// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useEffect, useState } from "react";
import { useI18n } from "../../i18n-context";
import { api } from "../../api-client";
import type { Settings } from "../../../../shared/types";
import { LoadingState } from "../../components/states";
import { RemindersList } from "../reminders-list";
import { ChatsTab } from "./chats-tab";
import { ChecksTab } from "./checks-tab";
import { PromptTab } from "./prompt-tab";
import { RateLimitTab } from "./rate-limit-tab";
import { UsersTab } from "./users-tab";
import { WhitelistTab } from "./whitelist-tab";
import type { AdminSection } from "../../lib/routes";

export function AdminSectionView({
  section,
  onEditUser,
  onEditChat,
  onEditCheck,
}: {
  section: AdminSection;
  onEditUser: (id: string, from: AdminSection) => void;
  onEditChat: (id: string, from: AdminSection) => void;
  onEditCheck: (id: string | null) => void;
}) {
  const { t: s } = useI18n();
  const [settings, setSettings] = useState<Settings | null>(null);
  const needsSettings = section === "prompt" || section === "ratelimit";
  const goUser = (id: string) => onEditUser(id, section);
  const goChat = (id: string) => onEditChat(id, section);

  useEffect(() => {
    if (needsSettings) api.getSettings().then(setSettings);
  }, [needsSettings]);

  if (section === "whitelist")
    return <WhitelistTab onOpenUser={goUser} onOpenChat={goChat} />;
  if (section === "users") return <UsersTab onEdit={goUser} />;
  if (section === "chats") return <ChatsTab onEdit={goChat} />;
  if (section === "checks")
    return (
      <ChecksTab
        onEdit={(id) => onEditCheck(id)}
        onCreate={() => onEditCheck(null)}
      />
    );
  if (section === "reminders")
    return (
      <RemindersList
        fetchReminders={api.listAdminReminders}
        header={s.ui_reminders_admin_header}
        emptyText={s.ui_reminders_admin_empty}
        footer={s.ui_reminders_admin_footer}
        showUserId={true}
        onUserClick={goUser}
      />
    );
  if (!settings) return <LoadingState />;
  if (section === "prompt")
    return <PromptTab settings={settings} onSaved={setSettings} />;
  return <RateLimitTab settings={settings} onSaved={setSettings} />;
}
