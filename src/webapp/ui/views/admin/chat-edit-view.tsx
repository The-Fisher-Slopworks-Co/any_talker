// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n-context";
import { useDateFmt } from "../../datetime-context";
import { api } from "../../api-client";
import type { Chat, ChatSettings, Settings } from "../../../../shared/types";
import { AccessRows } from "../../components/access-rows";
import { Hero } from "../../components/hero";
import { LargeTitle } from "../../components/large-title";
import { Card, SectionFooter, Stack } from "../../components/layout";
import { LoadingState } from "../../components/states";
import { ROW_CLS, ROW_LABEL_CLS, ROW_VALUE_CLS } from "../../components/row";
import { SaveStatus } from "../../components/save-status";
import { TextRow } from "../../components/text-row";
import { TimeNote } from "../../components/time-note";
import { chatSubtitle, chatTitle } from "../../lib/labels";
import { useAutosave } from "../../lib/use-autosave";
import { useLoadable } from "../../lib/use-loadable";
import { settingsLoad } from "./admin-section-view";
import { useFormReducer } from "../../lib/use-form-reducer";
import {
  EMPTY_CHAT_FORM,
  chatFormFromSettings,
  chatFormToSave,
  revertFailed,
  type ChatForm,
} from "./chat-edit-form";
import {
  KeywordFilterSection,
  ModelsSection,
  SystemPromptSection,
  AiSettingsSection,
} from "./chat-edit-sections";

// The chat plus the global settings it inherits from.
type Loaded = {
  global: Settings;
  chat: Chat;
  whitelisted: boolean;
  blacklisted: boolean;
};

// Both seed the form, which then edits its own copy.
export function chatEditLoads(chatId: string) {
  return {
    global: settingsLoad,
    chat: {
      key: `admin-chat:${chatId}`,
      load: () => api.getAdminChat(chatId),
      once: true,
    },
  };
}

export function ChatEditView({ chatId }: { chatId: string }) {
  const { t: s } = useI18n();
  const { short } = useDateFmt();
  const loads = chatEditLoads(chatId);
  const { data: globalData, error: globalFailed } = useLoadable(loads.global);
  const { data: d, error: chatFailed } = useLoadable(loads.chat);
  const notFound = globalFailed || chatFailed;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [form, set, resetForm] = useFormReducer(EMPTY_CHAT_FORM);

  // The server takes the whole record, so every change sends all of it, one
  // request at a time. `base` is the record last sent (what the next change is
  // diffed against, so a change back to an in-flight value is not lost) and
  // `confirmed` the one the server last answered with.
  const base = useRef<ChatSettings>({});
  const confirmed = useRef<ChatSettings>({});
  const latestForm = useRef(form);
  useEffect(() => {
    latestForm.current = form;
  });
  const { save, status } = useAutosave<
    ChatSettings,
    { settings: ChatSettings }
  >({
    send: (payload) => api.putAdminChat(chatId, payload),
    onSaved: ({ settings }) => {
      confirmed.current = settings;
    },
    onFailed: (payload) => {
      // A newer change was sent after this one; if that one also fails it
      // takes this one's fields back with its own.
      if (payload !== base.current || !loaded) return;
      base.current = confirmed.current;
      resetForm(
        revertFailed(
          latestForm.current,
          payload,
          confirmed.current,
          loaded.global,
        ),
      );
    },
  });

  // Before the first paint with the data, so the form never shows empty.
  useLayoutEffect(() => {
    if (!globalData || !d) return;
    base.current = d.settings;
    confirmed.current = d.settings;
    setLoaded({
      global: globalData,
      chat: d.chat,
      whitelisted: d.whitelisted,
      blacklisted: d.blacklisted,
    });
    resetForm(chatFormFromSettings(d.settings, globalData));
  }, [globalData, d, resetForm]);

  // Applies `patch` to the form and sends the result, unless that is nothing
  // new for the server.
  const commit = (patch: Partial<ChatForm>) => {
    const next = { ...form, ...patch };
    resetForm(next);
    const payload = chatFormToSave(next, base.current);
    if (payload) {
      base.current = payload;
      save(payload);
    }
  };
  // Telegram's back button leaves the screen without a blur, so whatever is
  // still being typed (prompt, keywords, model ids, bot name) is saved then.
  const leave = useRef(() => {});
  leave.current = () => commit({});
  useEffect(() => () => leave.current(), []);

  // Until the hero can name the chat, the page is titled like any other.
  if (notFound || !loaded)
    return (
      <>
        <LargeTitle>{s.ui_route_chat_settings}</LargeTitle>
        {notFound ? (
          <LoadingState text={s.ui_chat_not_found} />
        ) : (
          <LoadingState />
        )}
      </>
    );

  const { global, chat } = loaded;
  const title = chatTitle(s, chat);
  const sections = { form, set, commit, global };

  return (
    <Stack>
      <Hero id={chat.id} name={title} subtitle={chatSubtitle(s, chat)} />
      <Card>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_chat_id}</span>
          <span className={ROW_VALUE_CLS}>{chat.id}</span>
        </div>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_chat_last_seen}</span>
          <span className={ROW_VALUE_CLS}>{short(chat.lastSeenAt)}</span>
        </div>
      </Card>
      <SectionFooter>
        <TimeNote />
      </SectionFooter>

      <AccessRows
        kind="chats"
        id={chat.id}
        label={title}
        whitelisted={loaded.whitelisted}
        blacklisted={loaded.blacklisted}
        footer={s.ui_access_footer_chat}
      />

      <div className="section-gap">
        <Card>
          <TextRow
            label={s.ui_chat_bot_name}
            placeholder={s.ui_chat_bot_name_placeholder}
            value={form.botName}
            onChange={(v) => set("botName", v)}
            onCommit={() => commit({})}
            maxLength={64}
          />
        </Card>
      </div>
      <SectionFooter>{s.ui_chat_bot_name_footer}</SectionFooter>

      <AiSettingsSection {...sections} />
      <SystemPromptSection {...sections} />
      <ModelsSection {...sections} />
      <KeywordFilterSection {...sections} />
      <SaveStatus status={status} />
    </Stack>
  );
}
