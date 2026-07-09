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
import { ManagedBotsTab } from "./managed-bots-tab";
import { PromptTab } from "./prompt-tab";
import { RateLimitTab } from "./rate-limit-tab";
import { BudgetTab } from "./budget-tab";
import { SpendTab } from "./spend-tab";
import { UsersTab } from "./users-tab";
import { WhitelistTab } from "./whitelist-tab";
import type { AdminSection } from "../../lib/routes";

export function AdminSectionView({
  section,
  onEditUser,
  onEditChat,
  onEditCheck,
  onEditManagedBot,
}: {
  section: AdminSection;
  onEditUser: (id: string, from: AdminSection) => void;
  onEditChat: (id: string, from: AdminSection) => void;
  onEditCheck: (id: string | null) => void;
  onEditManagedBot: (id: string | null) => void;
}) {
  const { t: s } = useI18n();
  const [settings, setSettings] = useState<Settings | null>(null);
  const needsSettings =
    section === "prompt" ||
    section === "ratelimit" ||
    section === "budget" ||
    section === "whitelist";
  const goUser = (id: string) => onEditUser(id, section);
  const goChat = (id: string) => onEditChat(id, section);

  useEffect(() => {
    if (needsSettings) api.getSettings().then(setSettings);
  }, [needsSettings]);

  if (section === "spend") return <SpendTab />;
  if (section === "users") return <UsersTab onEdit={goUser} />;
  if (section === "chats") return <ChatsTab onEdit={goChat} />;
  if (section === "checks")
    return (
      <ChecksTab
        onEdit={(id) => onEditCheck(id)}
        onCreate={() => onEditCheck(null)}
      />
    );
  if (section === "bots")
    return (
      <ManagedBotsTab
        onEdit={(id) => onEditManagedBot(id)}
        onCreate={() => onEditManagedBot(null)}
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
  if (section === "whitelist")
    return (
      <WhitelistTab
        settings={settings}
        onSaved={setSettings}
        onOpenUser={goUser}
        onOpenChat={goChat}
      />
    );
  if (section === "prompt")
    return <PromptTab settings={settings} onSaved={setSettings} />;
  if (section === "budget")
    return <BudgetTab settings={settings} onSaved={setSettings} />;
  return <RateLimitTab settings={settings} onSaved={setSettings} />;
}
