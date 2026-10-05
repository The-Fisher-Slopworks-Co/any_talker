// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

/// <reference lib="dom" />
import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { api, type MeResponse, type UsageShare } from "./api-client";
import { I18nProvider, useI18n } from "./i18n-context";
import { DateFmtProvider } from "./datetime-context";
import { LargeTitle } from "./components/large-title";
import { BuildInfoFooter } from "./components/build-info-footer";
import { UsageHeader } from "./components/usage-header";
import {
  adminSectionLabel,
  fromRoute,
  parseRoute,
  showsLargeTitle,
  showsUsageHeader,
  type Route,
} from "./lib/routes";
import { useSessionState } from "./lib/session-state";
import { useBackButton } from "./lib/back-button";
import { settleStartup, startupLang, type Startup } from "./lib/startup";
import { matchTelegramChrome } from "./lib/telegram-chrome";
import { createNavigator, holdTapped, trackTaps } from "./lib/navigate";
import { preloadRoute } from "./views/route-loads";
import { MainView } from "./views/main-view";
import { RemindersList, myRemindersLoad } from "./views/reminders-list";
import { FactsView } from "./views/facts-view";
import { AdminView } from "./views/admin/admin-view";
import { AdminSectionView } from "./views/admin/admin-section-view";
import { UserEditView } from "./views/admin/user-edit-view";
import { ChatEditView } from "./views/admin/chat-edit-view";
import { CheckEditView } from "./views/admin/check-edit-view";
import { ManagedBotEditView } from "./views/admin/managed-bot-edit-view";
import { FeedbackView } from "./views/admin/feedback-view";

function AppShell({
  me,
  onMe,
}: {
  me: MeResponse;
  onMe: (m: MeResponse) => void;
}) {
  const { t: s } = useI18n();
  // The back button walks up from the current route alone, so restoring the
  // route after a reload restores the whole way back as well.
  const [route, setRoute] = useSessionState<Route>(
    "route",
    { kind: "main" },
    parseRoute,
  );
  // A tap opens the next screen once its data is in (or a short wait runs
  // out), so it opens whole instead of blank, then loading, then filled.
  const { navigate, cancel } = useMemo(
    () =>
      createNavigator<Route>({
        ready: preloadRoute,
        show: setRoute,
        hold: holdTapped,
      }),
    [setRoute],
  );
  // Back and the way out of a deleted item: their screens are already loaded.
  const go: typeof setRoute = (r) => {
    cancel();
    setRoute(r);
  };
  // undefined while loading (the header holds its place), null on failure.
  const [usage, setUsage] = useState<UsageShare | null | undefined>();

  // The header is fetched once at startup rather than by the main view, so it
  // does not reload every time the user comes back to the home screen. A
  // failure sets it null and the header simply doesn't render — never a
  // reason to block the settings the user actually opened.
  useEffect(() => {
    void usagePromise.then(setUsage);
  }, []);

  // Back goes one level up the route tree; the root screen has no back.
  useBackButton(
    route.kind === "main"
      ? null
      : () =>
          go((r) => {
            switch (r.kind) {
              case "user-edit":
              case "chat-edit":
                return fromRoute(r.from);
              case "check-edit":
                return { kind: "admin-section", section: "checks" };
              case "managed-bot-edit":
                return { kind: "admin-section", section: "bots" };
              case "feedback-view":
                return { kind: "admin-section", section: "feedback" };
              case "admin-section":
                return { kind: "admin" };
              case "admin":
              case "my-reminders":
              case "my-facts":
              case "main":
                return { kind: "main" };
            }
          }),
  );

  const title = (() => {
    switch (route.kind) {
      case "main":
        return s.ui_route_settings;
      case "admin":
        return s.ui_route_admin;
      case "admin-section":
        return adminSectionLabel(s, route.section);
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
      case "feedback-view":
        return s.ui_route_feedback;
      case "my-reminders":
        return s.ui_route_my_reminders;
      case "my-facts":
        return s.ui_route_my_facts;
    }
  })();

  const renderRoute = () => {
    switch (route.kind) {
      case "main":
        return (
          <MainView
            me={me}
            onMe={onMe}
            onOpenAdmin={() => navigate({ kind: "admin" })}
            onOpenMyReminders={() => navigate({ kind: "my-reminders" })}
            onOpenMyFacts={() => navigate({ kind: "my-facts" })}
          />
        );
      case "admin":
        return (
          <AdminView
            onOpenSection={(section) =>
              navigate({ kind: "admin-section", section })
            }
          />
        );
      case "admin-section":
        return (
          <AdminSectionView
            section={route.section}
            onEditUser={(id, from) =>
              navigate({ kind: "user-edit", userId: id, from })
            }
            onEditChat={(id, from) =>
              navigate({ kind: "chat-edit", chatId: id, from })
            }
            onEditCheck={(id) => navigate({ kind: "check-edit", checkId: id })}
            onEditManagedBot={(id) =>
              navigate({ kind: "managed-bot-edit", botId: id })
            }
            onOpenFeedback={(id) =>
              navigate({ kind: "feedback-view", feedbackId: id })
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
            onClose={() => go({ kind: "admin-section", section: "checks" })}
          />
        );
      case "managed-bot-edit":
        return (
          <ManagedBotEditView
            botId={route.botId}
            onClose={() => go({ kind: "admin-section", section: "bots" })}
          />
        );
      case "feedback-view":
        return (
          <FeedbackView
            feedbackId={route.feedbackId}
            onOpenUser={(id) =>
              navigate({
                kind: "user-edit",
                userId: id,
                from: { kind: "feedback-view", feedbackId: route.feedbackId },
              })
            }
            onOpenChat={(id) =>
              navigate({
                kind: "chat-edit",
                chatId: id,
                from: { kind: "feedback-view", feedbackId: route.feedbackId },
              })
            }
            onDeleted={() => go({ kind: "admin-section", section: "feedback" })}
          />
        );
      case "my-reminders":
        return (
          <RemindersList
            source={myRemindersLoad}
            header={s.ui_reminders_upcoming}
            emptyText={s.ui_reminders_empty_my}
            footer={s.ui_reminders_footer_my}
          />
        );
      case "my-facts":
        return <FactsView />;
    }
  };

  return (
    <div className="mx-auto max-w-[640px] px-3 pt-4 pb-8">
      {/* iOS Large Title: every screen names itself above its content. */}
      {showsLargeTitle(route) && <LargeTitle>{title}</LargeTitle>}
      {showsUsageHeader(route) && <UsageHeader usage={usage} />}
      {renderRoute()}
      {/* A commit hash means nothing to a regular user. */}
      {me.isOwner ? <BuildInfoFooter /> : null}
    </div>
  );
}

function LoadFailed() {
  const { t: s } = useI18n();
  return (
    <div className="text-center text-tg-hint py-20">{s.ui_load_failed}</div>
  );
}

const tg = window.Telegram?.WebApp;
// Full height before the first paint, so the viewport does not jump under it.
tg?.expand();
// Before the first render, so Telegram's chrome never shows another colour.
matchTelegramChrome(tg);
// Lets the row that started a navigation stay pressed while it waits.
trackTaps(document);
// Requested before React mounts, in parallel with it.
const startupPromise = settleStartup(api.getMe());
// Started alongside /me rather than once the shell mounts after it, so the
// header is not a whole round trip behind the settings.
const usagePromise: Promise<UsageShare | null> = api.getMyUsageShare().then(
  (r) => r.usage,
  () => null,
);

function App() {
  const [startup, setStartup] = useState<Startup>({ kind: "loading" });

  useEffect(() => {
    void startupPromise.then(setStartup);
  }, []);

  // Telegram keeps its own splash up until ready(): hand over only once the
  // first real frame — the settings in the saved language, or the error — has
  // been committed, never a blank or half-translated one.
  useEffect(() => {
    if (startup.kind !== "loading") tg?.ready();
  }, [startup.kind]);

  const lang = startupLang(startup, tg?.initDataUnsafe?.user?.language_code);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  if (startup.kind === "loading") return null;
  if (startup.kind === "failed") {
    return (
      <I18nProvider lang={lang}>
        <LoadFailed />
      </I18nProvider>
    );
  }
  const { me } = startup;
  return (
    <I18nProvider lang={lang}>
      <DateFmtProvider dateFormat={me.dateFormat} timezone={me.timezone}>
        <AppShell me={me} onMe={(m) => setStartup({ kind: "ready", me: m })} />
      </DateFmtProvider>
    </I18nProvider>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
