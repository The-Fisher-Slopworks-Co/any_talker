// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n-context";
import { api, type ManagedBotDetail } from "../../api-client";
import {
  Card,
  SectionFooter,
  SectionHeader,
  Stack,
} from "../../components/layout";
import { LoadingState } from "../../components/states";
import { DeleteButton, RowButton, SaveButton } from "../../components/controls";
import {
  INPUT_CLS,
  ROW_CLS,
  ROW_LABEL_CLS,
  ROW_VALUE_CLS,
} from "../../components/row";

const TEXTAREA_CLS =
  "block w-full box-border bg-transparent border-0 px-4 py-3 text-base min-h-[140px]";

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
    api.getManagedBotNewInfo().then(setInfo).catch(() => setInfo(null));
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
            <span className={ROW_LABEL_CLS}>{s.ui_mbot_create_need_manage}</span>
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
  const [displayName, setDisplayName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avatarMsg, setAvatarMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .getManagedBot(botId)
      .then((d) => {
        setDetail(d);
        setDisplayName(d.bot.displayName);
        setSystemPrompt(d.bot.systemPrompt);
      })
      .catch(() => setNotFound(true));
  }, [botId]);

  if (notFound) return <LoadingState text={s.ui_mbot_not_found} />;
  if (!detail) return <LoadingState />;

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.updateManagedBot(botId, { displayName, systemPrompt });
      onClose();
    } catch (err) {
      const code = (err as { code?: string | null }).code ?? "save_failed";
      setError(code ?? "save_failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm(s.ui_mbot_delete_confirm)) return;
    setDeleting(true);
    try {
      await api.deleteManagedBot(botId);
      onClose();
    } catch {
      setDeleting(false);
    }
  };

  const onPickAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarMsg(null);
    try {
      const dataUrl = await fileToDataUrl(file);
      await api.setManagedBotAvatar(botId, dataUrl);
      setAvatarMsg(s.ui_mbot_avatar_saved);
    } catch {
      setAvatarMsg(s.ui_mbot_avatar_failed);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const status = detail.running ? s.ui_mbots_running : s.ui_mbots_stopped;

  return (
    <Stack>
      <SectionHeader>{s.ui_mbot_display_name}</SectionHeader>
      <Card>
        <label className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_mbot_display_name}</span>
          <input
            className={INPUT_CLS}
            placeholder={s.ui_mbot_display_name_placeholder}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={64}
          />
        </label>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_mbot_username}</span>
          <span className={ROW_VALUE_CLS}>@{detail.bot.username}</span>
        </div>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_mbot_status}</span>
          <span className={ROW_VALUE_CLS}>{status}</span>
        </div>
      </Card>

      <SectionHeader>{s.ui_mbot_system_prompt}</SectionHeader>
      <Card>
        <textarea
          className={TEXTAREA_CLS}
          placeholder={s.ui_mbot_system_prompt_placeholder}
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
        />
      </Card>
      <SectionFooter>{s.ui_mbot_system_prompt_footer}</SectionFooter>

      <SectionHeader>{s.ui_mbot_avatar}</SectionHeader>
      <Card>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png"
          className="hidden"
          onChange={onPickAvatar}
        />
        <RowButton onClick={() => fileRef.current?.click()}>
          {s.ui_mbot_avatar_upload}
        </RowButton>
      </Card>
      <SectionFooter>{avatarMsg ?? s.ui_mbot_avatar_footer}</SectionFooter>

      {error && (
        <SectionFooter>{s.ui_mbot_save_error(error)}</SectionFooter>
      )}

      <SaveButton
        saving={saving}
        dirty={true}
        disabled={saving || deleting}
        onClick={submit}
      />

      <Card>
        <DeleteButton disabled={saving || deleting} onClick={remove}>
          {s.ui_mbot_delete}
        </DeleteButton>
      </Card>
    </Stack>
  );
}
