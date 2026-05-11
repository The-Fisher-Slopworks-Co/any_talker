// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useEffect, useState } from "react";
import { useI18n } from "../../i18n-context";
import { api, type UserSettingsResponse } from "../../api-client";
import {
  Card,
  SectionFooter,
  SectionHeader,
  Stack,
} from "../../components/layout";
import { LoadingState } from "../../components/states";
import { RowButton, SaveButton } from "../../components/controls";
import { WhitelistToggleButton } from "../../components/whitelist-toggle-button";
import {
  INPUT_CLS,
  ROW_CLS,
  ROW_LABEL_CLS,
  ROW_VALUE_CLS,
} from "../../components/row";
import { userDisplayName } from "../../lib/labels";
import { openTelegramProfile } from "../../lib/telegram";

export function UserEditView({ userId }: { userId: string }) {
  const { t: s } = useI18n();
  const [data, setData] = useState<UserSettingsResponse | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    api
      .getAdminUser(userId)
      .then((d) => {
        setData(d);
        setName(d.displayName ?? "");
      })
      .catch(() => setNotFound(true));
  }, [userId]);

  if (notFound) return <LoadingState text={s.ui_user_not_found} />;
  if (!data) return <LoadingState />;

  const { user } = data;
  const fallbackName = userDisplayName(user);
  const dirty = name.trim() !== (data.displayName ?? "");

  const save = async () => {
    setSaving(true);
    try {
      const next = await api.putAdminUser(userId, name.trim() || null);
      setData((prev) => (prev ? { ...prev, ...next } : null));
      setName(next.displayName ?? "");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack>
      <SectionHeader>{s.ui_user_profile}</SectionHeader>
      <Card>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_user_name}</span>
          <span className={ROW_VALUE_CLS}>{fallbackName}</span>
        </div>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_user_username}</span>
          <span className={ROW_VALUE_CLS}>
            {user.username ? `@${user.username}` : s.ui_dash}
          </span>
        </div>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_user_id}</span>
          <span className={ROW_VALUE_CLS}>{user.id}</span>
        </div>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_user_last_seen}</span>
          <span className={ROW_VALUE_CLS}>
            {new Date(user.lastSeenAt).toLocaleString()}
          </span>
        </div>
        <RowButton onClick={() => openTelegramProfile(user)}>
          {s.ui_user_open_in_tg}
        </RowButton>
        <WhitelistToggleButton
          kind="users"
          id={user.id}
          label={fallbackName}
          initial={data.whitelisted}
        />
      </Card>

      <SectionHeader>{s.ui_main_display_name}</SectionHeader>
      <Card>
        <label className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_user_name}</span>
          <input
            className={INPUT_CLS}
            placeholder={fallbackName}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
      </Card>
      <SectionFooter>{s.ui_user_display_name_footer}</SectionFooter>

      <SaveButton saving={saving} dirty={dirty} onClick={save} />
    </Stack>
  );
}
