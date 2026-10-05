// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { api } from "../../api-client";
import { LoadingState } from "../../components/states";
import { useLoadable } from "../../lib/use-loadable";
import { ApiTokenTab } from "./api-token-tab";
import { ChatsTab } from "./chats-tab";
import { ChecksTab } from "./checks-tab";
import { FeedbackTab } from "./feedback-tab";
import { ManagedBotsTab } from "./managed-bots-tab";
import { PromptTab } from "./prompt-tab";
import { QuarantineTab } from "./quarantine-tab";
import { RateLimitTab } from "./rate-limit-tab";
import { RemindersTab } from "./reminders-tab";
import { BudgetTab } from "./budget-tab";
import { SpendTab } from "./spend-tab";
import { UsersTab } from "./users-tab";
import { WhitelistTab } from "./whitelist-tab";
import type { AdminSection } from "../../lib/routes";

// The global settings, which each screen editing them copies into a form.
export const settingsLoad = {
  key: "admin-settings",
  load: () => api.getSettings(),
  once: true,
};

export function AdminSectionView({
  section,
  onEditUser,
  onEditChat,
  onEditCheck,
  onEditManagedBot,
  onOpenFeedback,
}: {
  section: AdminSection;
  onEditUser: (id: string, from: AdminSection) => void;
  onEditChat: (id: string, from: AdminSection) => void;
  onEditCheck: (id: string | null) => void;
  onEditManagedBot: (id: string | null) => void;
  onOpenFeedback: (id: string) => void;
}) {
  const goUser = (id: string) => onEditUser(id, section);
  const goChat = (id: string) => onEditChat(id, section);

  if (section === "spend")
    return <SpendTab onEditUser={goUser} onEditChat={goChat} />;
  if (section === "quarantine") return <QuarantineTab />;
  if (section === "feedback") return <FeedbackTab onOpen={onOpenFeedback} />;
  if (section === "api-token") return <ApiTokenTab />;
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
  return <SettingsSection section={section} goUser={goUser} goChat={goChat} />;
}

// The sections that edit the global settings, each in a copy of its own.
function SettingsSection({
  section,
  goUser,
  goChat,
}: {
  section: AdminSection;
  goUser: (id: string) => void;
  goChat: (id: string) => void;
}) {
  const { data: settings, setData: setSettings } = useLoadable(settingsLoad);
  if (!settings) return <LoadingState />;
  if (section === "reminders")
    return (
      <RemindersTab
        settings={settings}
        onSaved={setSettings}
        onUserClick={goUser}
      />
    );
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
