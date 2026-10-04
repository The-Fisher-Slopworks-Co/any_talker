// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n-context";
import { api } from "../../api-client";
import type { Chat, ChatSettings, Settings } from "../../../../shared/types";
import { Stack } from "../../components/layout";
import { LoadingState } from "../../components/states";
import { SaveStatus } from "../../components/save-status";
import { useAutosave } from "../../lib/use-autosave";
import { useFormReducer } from "../../lib/use-form-reducer";
import {
  EMPTY_CHAT_FORM,
  chatFormFromSettings,
  chatFormToSave,
  revertFailed,
  type ChatForm,
} from "./chat-edit-form";
import {
  BotNameSection,
  ChatInfoCard,
  KeywordFilterSection,
  ModelsSection,
  ProviderRoutingSection,
  ProviderSection,
  ServiceTierSection,
  SystemPromptSection,
  TimezoneOverrideSection,
} from "./chat-edit-sections";

// The chat plus the global settings it inherits from.
type Loaded = {
  global: Settings;
  chat: Chat;
  whitelisted: boolean;
  blacklisted: boolean;
};

export function ChatEditView({ chatId }: { chatId: string }) {
  const { t: s } = useI18n();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [notFound, setNotFound] = useState(false);
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

  useEffect(() => {
    Promise.all([api.getSettings(), api.getAdminChat(chatId)])
      .then(([global, d]) => {
        base.current = d.settings;
        confirmed.current = d.settings;
        setLoaded({
          global,
          chat: d.chat,
          whitelisted: d.whitelisted,
          blacklisted: d.blacklisted,
        });
        resetForm(chatFormFromSettings(d.settings, global));
      })
      .catch(() => setNotFound(true));
  }, [chatId, resetForm]);

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

  if (notFound) return <LoadingState text={s.ui_chat_not_found} />;
  if (!loaded) return <LoadingState />;

  const { global } = loaded;
  const sections = { form, set, commit, global };

  return (
    <Stack>
      <ChatInfoCard
        chat={loaded.chat}
        whitelisted={loaded.whitelisted}
        blacklisted={loaded.blacklisted}
      />
      <BotNameSection {...sections} />
      <SystemPromptSection {...sections} />
      <ModelsSection {...sections} />
      <TimezoneOverrideSection {...sections} />
      <ProviderRoutingSection {...sections} />
      <ProviderSection {...sections} />
      <ServiceTierSection {...sections} />
      <KeywordFilterSection {...sections} />
      <SaveStatus status={status} />
    </Stack>
  );
}
