// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { Card, SectionFooter, SectionHeader, Stack } from "./layout";
import { EmptyState, LoadingState } from "./states";
import { NavRow } from "./select-row";
import { RowButton } from "./controls";

// Admin tab shell: a section of navigable rows over `items` (still loading
// while `items` is null) plus a create button below it.
export function ListTab<T>({
  items,
  header,
  empty,
  footer,
  createLabel,
  onEdit,
  onCreate,
  renderRow,
}: {
  items: T[] | null;
  header: string;
  empty: string;
  footer: string;
  createLabel: string;
  onEdit: (id: string) => void;
  onCreate: () => void;
  renderRow: (item: T) => { id: string; title: string; subtitle: string };
}) {
  if (items === null) return <LoadingState />;

  return (
    <Stack>
      <SectionHeader>{header}</SectionHeader>
      <Card>
        {items.length === 0 ? (
          <EmptyState>{empty}</EmptyState>
        ) : (
          items.map((item) => {
            const row = renderRow(item);
            return (
              <NavRow
                key={row.id}
                title={row.title}
                subtitle={row.subtitle}
                onClick={() => onEdit(row.id)}
              />
            );
          })
        )}
      </Card>
      <SectionFooter>{footer}</SectionFooter>
      <Card>
        <RowButton onClick={onCreate}>{createLabel}</RowButton>
      </Card>
    </Stack>
  );
}
