// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

/// <reference lib="dom" />
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { api, type MeResponse } from "./api-client";
import { resolveLang, type Lang } from "../../shared/i18n";
import { I18nProvider, useI18n } from "./i18n-context";
import { LoadingState } from "./components/states";
import { BuildInfoFooter } from "./components/build-info-footer";
import { adminSection, type Route } from "./lib/routes";
import { MainView } from "./views/main-view";
import { RemindersList } from "./views/reminders-list";
import { AdminView } from "./views/admin/admin-view";
import { AdminSectionView } from "./views/admin/admin-section-view";
import { UserEditView } from "./views/admin/user-edit-view";
import { ChatEditView } from "./views/admin/chat-edit-view";
import { CheckEditView } from "./views/admin/check-edit-view";
import { ManagedBotEditView } from "./views/admin/managed-bot-edit-view";

function AppShell({
  me,
  onMe,
}: {
  me: MeResponse | null;
  onMe: (m: MeResponse) => void;
}) {
  const { t: s } = useI18n();
  const [route, setRoute] = useState<Route>({ kind: "main" });

  useEffect(() => {
    const btn = window.Telegram?.WebApp?.BackButton;
    if (!btn) return;
    if (route.kind === "main") {
      btn.hide();
      return;
    }
    const handler = () => {
      setRoute((r) => {
        switch (r.kind) {
          case "user-edit":
          case "chat-edit":
            return { kind: "admin-section", section: r.from };
          case "check-edit":
            return { kind: "admin-section", section: "checks" };
          case "managed-bot-edit":
            return { kind: "admin-section", section: "bots" };
          case "admin-section":
            return { kind: "admin" };
          case "admin":
          case "my-reminders":
          case "main":
            return { kind: "main" };
        }
      });
    };
    btn.show();
    btn.onClick(handler);
    return () => {
      btn.offClick(handler);
      btn.hide();
    };
  }, [route.kind]);

  const title = (() => {
    switch (route.kind) {
      case "main":
        return s.ui_route_settings;
      case "admin":
        return s.ui_route_admin;
      case "admin-section":
        return adminSection(s, route.section).label;
      case "user-edit":
        return s.ui_route_user_settings;
      case "chat-edit":
        return s.ui_route_chat_settings;
      case "check-edit":
        return route.checkId === null
          ? s.ui_route_check_create
          : s.ui_route_check_edit;
      case "managed-bot-edit":
        return route.botId === null
          ? s.ui_route_bot_create
          : s.ui_route_bot_edit;
      case "my-reminders":
        return s.ui_route_my_reminders;
    }
  })();

  const renderRoute = () => {
    if (!me) return <LoadingState />;
    switch (route.kind) {
      case "main":
        return (
          <MainView
            me={me}
            onMe={onMe}
            onOpenAdmin={() => setRoute({ kind: "admin" })}
            onOpenMyReminders={() => setRoute({ kind: "my-reminders" })}
          />
        );
      case "admin":
        return (
          <AdminView
            onOpenSection={(section) =>
              setRoute({ kind: "admin-section", section })
            }
          />
        );
      case "admin-section":
        return (
          <AdminSectionView
            section={route.section}
            onEditUser={(id, from) =>
              setRoute({ kind: "user-edit", userId: id, from })
            }
            onEditChat={(id, from) =>
              setRoute({ kind: "chat-edit", chatId: id, from })
            }
            onEditCheck={(id) => setRoute({ kind: "check-edit", checkId: id })}
            onEditManagedBot={(id) =>
              setRoute({ kind: "managed-bot-edit", botId: id })
            }
          />
        );
      case "user-edit":
        return <UserEditView userId={route.userId} />;
      case "chat-edit":
        return <ChatEditView chatId={route.chatId} />;
      case "check-edit":
        return (
          <CheckEditView
            checkId={route.checkId}
            onClose={() =>
              setRoute({ kind: "admin-section", section: "checks" })
            }
          />
        );
      case "managed-bot-edit":
        return (
          <ManagedBotEditView
            botId={route.botId}
            onClose={() =>
              setRoute({ kind: "admin-section", section: "bots" })
            }
          />
        );
      case "my-reminders":
        return (
          <RemindersList
            fetchReminders={api.listMyReminders}
            header={s.ui_reminders_upcoming}
            emptyText={s.ui_reminders_empty_my}
            footer={s.ui_reminders_footer_my}
            showUserId={false}
          />
        );
    }
  };

  return (
    <div className="mx-auto max-w-[640px] px-3 pt-4 pb-8">
      <div className="px-1 pt-2 pb-4 text-xl font-semibold">{title}</div>
      {renderRoute()}
      <BuildInfoFooter />
    </div>
  );
}

function App() {
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    tg?.ready();
    tg?.expand();
    api.getMe().then(setMe);
  }, []);

  const tg = window.Telegram?.WebApp;
  const tgCode = tg?.initDataUnsafe?.user?.language_code;
  const lang: Lang = resolveLang(me?.language ?? null, tgCode);

  return (
    <I18nProvider lang={lang}>
      <AppShell me={me} onMe={setMe} />
    </I18nProvider>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
