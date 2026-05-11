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

  if (checks === null) return <LoadingState />;

  return (
    <Stack>
      <SectionHeader>{s.ui_checks_all}</SectionHeader>
      <Card>
        {checks.length === 0 ? (
          <EmptyState>{s.ui_checks_empty}</EmptyState>
        ) : (
          checks.map((c) => {
            const hh = String(c.scheduleHour).padStart(2, "0");
            const mm = String(c.scheduleMinute).padStart(2, "0");
            const status = c.enabled ? "" : ` · ${s.ui_checks_paused_marker}`;
            const subtitle = `${hh}:${mm} · ${c.timezone}${status}`;
            return (
              <NavRow
                key={c.id}
                title={c.title}
                subtitle={subtitle}
                onClick={() => onEdit(c.id)}
              />
            );
          })
        )}
      </Card>
      <SectionFooter>{s.ui_checks_footer}</SectionFooter>
      <Card>
        <RowButton onClick={onCreate}>{s.ui_checks_create}</RowButton>
      </Card>
    </Stack>
  );
}
