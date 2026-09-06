// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../../i18n-context";
import { api } from "../../api-client";
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
  const { data: bots } = useLoadable(
    () => api.listManagedBots().then((r) => r.bots),
    [],
  );

  return (
    <ListTab
      items={bots}
      header={s.ui_mbots_all}
      empty={s.ui_mbots_empty}
      footer={s.ui_mbots_footer}
      createLabel={s.ui_mbots_create}
      onEdit={onEdit}
      onCreate={onCreate}
      renderRow={(b) => ({
        id: b.botId,
        title: b.displayName,
        subtitle: `@${b.username} · ${b.running ? s.ui_mbots_running : s.ui_mbots_stopped}`,
      })}
    />
  );
}
