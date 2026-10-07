// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../../i18n-context";
import { api } from "../../api-client";
import { ListTab } from "../../components/list-tab";
import { useLoadable } from "../../lib/use-loadable";

const checksLoad = {
  key: "admin-checks",
  load: () => api.listChecks().then((r) => r.checks),
};

export function ChecksTab({
  onEdit,
  onCreate,
}: {
  onEdit: (id: string) => void;
  onCreate: () => void;
}) {
  const { t: s } = useI18n();
  const { data: checks } = useLoadable(checksLoad);

  return (
    <ListTab
      items={checks}
      footer={s.ui_checks_footer}
      createLabel={s.ui_route_check_create}
      onEdit={onEdit}
      onCreate={onCreate}
      renderRow={(c) => {
        const hh = String(c.scheduleHour).padStart(2, "0");
        const mm = String(c.scheduleMinute).padStart(2, "0");
        return {
          id: c.id,
          title: c.title,
          subtitle: `${hh}:${mm} · ${c.timezone}`,
          ...(c.enabled ? {} : { value: s.ui_checks_disabled }),
        };
      }}
    />
  );
}
