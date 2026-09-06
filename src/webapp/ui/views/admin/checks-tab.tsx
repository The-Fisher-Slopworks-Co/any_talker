// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../../i18n-context";
import { api } from "../../api-client";
import { ListTab } from "../../components/list-tab";
import { useLoadable } from "../../lib/use-loadable";

export function ChecksTab({
  onEdit,
  onCreate,
}: {
  onEdit: (id: string) => void;
  onCreate: () => void;
}) {
  const { t: s } = useI18n();
  const { data: checks } = useLoadable(
    () => api.listChecks().then((r) => r.checks),
    [],
  );

  return (
    <ListTab
      items={checks}
      header={s.ui_checks_all}
      empty={s.ui_checks_empty}
      footer={s.ui_checks_footer}
      createLabel={s.ui_checks_create}
      onEdit={onEdit}
      onCreate={onCreate}
      renderRow={(c) => {
        const hh = String(c.scheduleHour).padStart(2, "0");
        const mm = String(c.scheduleMinute).padStart(2, "0");
        const status = c.enabled ? "" : ` · ${s.ui_checks_paused_marker}`;
        return {
          id: c.id,
          title: c.title,
          subtitle: `${hh}:${mm} · ${c.timezone}${status}`,
        };
      }}
    />
  );
}
