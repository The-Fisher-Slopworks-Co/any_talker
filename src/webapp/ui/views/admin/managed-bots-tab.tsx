// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../../i18n-context";
import { api } from "../../api-client";
import {
  Card,
  SectionFooter,
  SectionHeader,
  Stack,
} from "../../components/layout";
import { EmptyState, LoadingState } from "../../components/states";
import { NavRow } from "../../components/select-row";
import { RowButton } from "../../components/controls";
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

  if (bots === null) return <LoadingState />;

  return (
    <Stack>
      <SectionHeader>{s.ui_mbots_all}</SectionHeader>
      <Card>
        {bots.length === 0 ? (
          <EmptyState>{s.ui_mbots_empty}</EmptyState>
        ) : (
          bots.map((b) => {
            const status = b.running ? s.ui_mbots_running : s.ui_mbots_stopped;
            const subtitle = `@${b.username} · ${status}`;
            return (
              <NavRow
                key={b.botId}
                title={b.displayName}
                subtitle={subtitle}
                onClick={() => onEdit(b.botId)}
              />
            );
          })
        )}
      </Card>
      <SectionFooter>{s.ui_mbots_footer}</SectionFooter>
      <Card>
        <RowButton onClick={onCreate}>{s.ui_mbots_create}</RowButton>
      </Card>
    </Stack>
  );
}
