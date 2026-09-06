// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useEffect, useState } from "react";
import { useI18n } from "../../i18n-context";
import { api } from "../../api-client";
import type { Chat, ChatSettings, Settings } from "../../../../shared/types";
import { Stack } from "../../components/layout";
import { LoadingState } from "../../components/states";
import { SaveButton } from "../../components/controls";
import { useFormReducer } from "../../lib/use-form-reducer";
import {
  EMPTY_CHAT_FORM,
  chatFormFromSettings,
  chatFormPayload,
  isChatFormDirty,
  isChatFormValid,
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

// The chat plus the global settings it inherits from. `settings` is the stored
// record the form is diffed against, so a save replaces it.
type Loaded = {
  global: Settings;
  chat: Chat;
  settings: ChatSettings;
  whitelisted: boolean;
  blacklisted: boolean;
};

export function ChatEditView({ chatId }: { chatId: string }) {
  const { t: s } = useI18n();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [form, set, resetForm] = useFormReducer(EMPTY_CHAT_FORM);

  useEffect(() => {
    Promise.all([api.getSettings(), api.getAdminChat(chatId)])
      .then(([global, d]) => {
        setLoaded({
          global,
          chat: d.chat,
          settings: d.settings,
          whitelisted: d.whitelisted,
          blacklisted: d.blacklisted,
        });
        resetForm(chatFormFromSettings(d.settings, global));
      })
      .catch(() => setNotFound(true));
  }, [chatId, resetForm]);

  if (notFound) return <LoadingState text={s.ui_chat_not_found} />;
  if (!loaded) return <LoadingState />;

  const { global, settings: original } = loaded;
  const dirty = isChatFormDirty(form, original);
  const canSave = dirty && isChatFormValid(form);

  const save = async () => {
    setSaving(true);
    try {
      const result = await api.putAdminChat(chatId, chatFormPayload(form));
      setLoaded((prev) =>
        prev ? { ...prev, settings: result.settings } : prev,
      );
      resetForm(chatFormFromSettings(result.settings, global));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack>
      <ChatInfoCard
        chat={loaded.chat}
        whitelisted={loaded.whitelisted}
        blacklisted={loaded.blacklisted}
      />
      <BotNameSection form={form} set={set} />
      <SystemPromptSection form={form} set={set} global={global} />
      <ModelsSection form={form} set={set} global={global} />
      <TimezoneOverrideSection form={form} set={set} global={global} />
      <ProviderRoutingSection form={form} set={set} global={global} />
      <ProviderSection form={form} set={set} global={global} />
      <ServiceTierSection form={form} set={set} global={global} />
      <KeywordFilterSection form={form} set={set} />
      <SaveButton
        saving={saving}
        dirty={dirty}
        disabled={saving || !canSave}
        onClick={save}
      />
    </Stack>
  );
}
