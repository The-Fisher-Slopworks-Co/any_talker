// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../../i18n-context";
import { api } from "../../api-client";
import { Avatar } from "../../components/avatar";
import { ListTab } from "../../components/list-tab";
import { useLoadable } from "../../lib/use-loadable";

export function ManagedBotsTab({
  onEdit,
  onCreate,
}: {
  onEdit: (botId: string) => void;
  onCreate: () => void;
}) {
  const { t: s } = useI18n();
  const { data: bots } = useLoadable("admin-managed-bots", () =>
    api.listManagedBots().then((r) => r.bots),
  );

  return (
    <ListTab
      items={bots}
      footer={s.ui_mbots_footer}
      createLabel={s.ui_mbots_create}
      onEdit={onEdit}
      onCreate={onCreate}
      renderRow={(b) => ({
        id: b.botId,
        title: b.displayName,
        subtitle: `@${b.username}`,
        value: b.running ? s.ui_mbots_running : s.ui_mbots_stopped,
        avatar: <Avatar id={b.botId} name={b.displayName} />,
      })}
    />
  );
}
