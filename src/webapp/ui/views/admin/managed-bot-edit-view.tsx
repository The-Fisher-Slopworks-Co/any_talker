// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n-context";
import { api, type ManagedBotDetail } from "../../api-client";
import { Hero } from "../../components/hero";
import { LargeTitle } from "../../components/large-title";
import {
  Card,
  SectionFooter,
  SectionHeader,
  Stack,
} from "../../components/layout";
import { LoadingState } from "../../components/states";
import {
  OptimizePromptFooter,
  OptimizePromptRow,
  useOptimizePrompt,
} from "../../components/optimize-prompt-button";
import { ActionRow, RowButton } from "../../components/controls";
import { INPUT_CLS, ROW_CLS, ROW_LABEL_CLS } from "../../components/row";
import { SaveStatus } from "../../components/save-status";
import { AreaRow, TextRow } from "../../components/text-row";
import { useAutosave } from "../../lib/use-autosave";
import { useFailureToast } from "../../lib/use-failure-toast";
import { botForm, revertFailed, type BotForm } from "./managed-bot-form";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function ManagedBotEditView({
  botId,
  onClose,
}: {
  botId: string | null;
  onClose: () => void;
}) {
  if (botId === null) return <CreateBotForm />;
  return <EditBotForm botId={botId} onClose={onClose} />;
}

// Create flow: the bot is actually created by Telegram via the native Bot API
// 9.6 managed-bots handshake. We can only kick it off — open the
// `t.me/newbot/{manager}/{suggested}` deep link — then it shows up in the list
// once Telegram notifies the main bot.
function CreateBotForm() {
  const { t: s } = useI18n();
  const [info, setInfo] = useState<{
    username: string | null;
    canManageBots: boolean;
  } | null>(null);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");

  useEffect(() => {
    api
      .getManagedBotNewInfo()
      .then(setInfo)
      .catch(() => setInfo(null));
  }, []);

  if (info === null) return <LoadingState />;

  const open = () => {
    if (!info.username) return;
    let link = `https://t.me/newbot/${info.username}`;
    if (username.trim()) link += `/${username.trim()}`;
    if (name.trim()) link += `?name=${encodeURIComponent(name.trim())}`;
    const tg = window.Telegram?.WebApp;
    if (tg?.openTelegramLink) tg.openTelegramLink(link);
    else if (tg?.openLink) tg.openLink(link);
  };

  return (
    <Stack>
      <SectionFooter>{s.ui_mbot_create_intro}</SectionFooter>

      {!info.canManageBots && (
        <Card>
          <div className={ROW_CLS}>
            <span className={ROW_LABEL_CLS}>
              {s.ui_mbot_create_need_manage}
            </span>
          </div>
        </Card>
      )}

      <SectionHeader>{s.ui_mbot_create_name}</SectionHeader>
      <Card>
        <label className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_mbot_create_name}</span>
          <input
            className={INPUT_CLS}
            placeholder={s.ui_mbot_create_name_placeholder}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={64}
          />
        </label>
        <label className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_mbot_create_username}</span>
          <input
            className={INPUT_CLS}
            placeholder={s.ui_mbot_create_username_placeholder}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={32}
          />
        </label>
      </Card>

      <Card>
        <RowButton
          disabled={!info.canManageBots || !info.username}
          onClick={open}
        >
          {s.ui_mbot_create_open}
        </RowButton>
      </Card>
      <SectionFooter>{s.ui_mbot_create_footer}</SectionFooter>
    </Stack>
  );
}

function EditBotForm({
  botId,
  onClose,
}: {
  botId: string;
  onClose: () => void;
}) {
  const { t: s } = useI18n();
  const [detail, setDetail] = useState<ManagedBotDetail | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    api
      .getManagedBot(botId)
      .then(setDetail)
      .catch(() => setNotFound(true));
  }, [botId]);

  // Until the hero can name the bot, the page is titled like any other.
  if (notFound || !detail)
    return (
      <>
        <LargeTitle>{s.ui_route_bot_edit}</LargeTitle>
        {notFound ? (
          <LoadingState text={s.ui_mbot_not_found} />
        ) : (
          <LoadingState />
        )}
      </>
    );
  return <BotEditor botId={botId} detail={detail} onClose={onClose} />;
}

// The name and prompt save when their field is left or the screen goes away.
function BotEditor({
  botId,
  detail,
  onClose,
}: {
  botId: string;
  detail: ManagedBotDetail;
  onClose: () => void;
}) {
  const { t: s } = useI18n();
  const { bot } = detail;
  const [form, setForm] = useState(() => botForm(bot));
  // Both fields go every time. `queued` is what was last sent (the next
  // change is compared with it) and `confirmed` what the server last kept.
  const queued = useRef<BotForm>(form);
  const confirmed = useRef<BotForm>(form);
  const optimize = useOptimizePrompt(form.systemPrompt);
  const { save, status } = useAutosave<BotForm, ManagedBotDetail>({
    send: (payload) => api.updateManagedBot(botId, payload),
    onSaved: (saved) => {
      confirmed.current = botForm(saved.bot);
    },
    onFailed: (payload) => {
      // A newer payload was queued after this one and carries its fields on.
      if (payload !== queued.current) return;
      queued.current = confirmed.current;
      setForm((f) => revertFailed(f, payload, confirmed.current));
    },
  });
  const failure = useFailureToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [deleting, setDeleting] = useState(false);

  const commit = () => {
    if (
      form.displayName === queued.current.displayName &&
      form.systemPrompt === queued.current.systemPrompt
    )
      return;
    queued.current = form;
    save(form);
  };

  const remove = async () => {
    if (!confirm(s.ui_mbot_delete_confirm)) return;
    setDeleting(true);
    try {
      await api.deleteManagedBot(botId);
      onClose();
    } catch {
      failure.fail();
      setDeleting(false);
    }
  };

  const onPickAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await api.setManagedBotAvatar(botId, await fileToDataUrl(file));
    } catch {
      failure.fail();
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <Stack>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        onChange={onPickAvatar}
      />
      <Hero
        id={bot.botId}
        name={form.displayName.trim() || bot.displayName}
        subtitle={`@${bot.username}`}
        note={detail.running ? s.ui_mbots_running : s.ui_mbots_stopped}
        action={{
          label: s.ui_mbot_avatar_edit,
          onClick: () => fileRef.current?.click(),
        }}
        actionUnderAvatar
      />

      <div className="section-gap">
        <Card>
          <TextRow
            label={s.ui_mbot_display_name}
            placeholder={s.ui_mbot_display_name_placeholder}
            value={form.displayName}
            onChange={(displayName) => setForm({ ...form, displayName })}
            onCommit={commit}
            maxLength={64}
          />
        </Card>
      </div>

      <SectionHeader>{s.ui_mbot_system_prompt}</SectionHeader>
      <Card>
        <AreaRow
          label={s.ui_mbot_system_prompt}
          placeholder={s.ui_mbot_system_prompt_placeholder}
          value={form.systemPrompt}
          onChange={(systemPrompt) => setForm({ ...form, systemPrompt })}
          onCommit={commit}
        />
        <OptimizePromptRow optimize={optimize} />
      </Card>
      <SectionFooter>{s.ui_mbot_system_prompt_footer}</SectionFooter>
      <OptimizePromptFooter optimize={optimize} autosaves />

      <div className="section-gap">
        <Card>
          <ActionRow destructive disabled={deleting} onClick={remove}>
            {s.ui_mbot_delete}
          </ActionRow>
        </Card>
      </div>
      <SaveStatus status={failure.status === "failed" ? "failed" : status} />
    </Stack>
  );
}
