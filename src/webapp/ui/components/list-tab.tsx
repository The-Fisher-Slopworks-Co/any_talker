// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { ReactNode } from "react";
import { Card, SectionFooter, Stack } from "./layout";
import { LoadingState } from "./states";
import { NavRow } from "./select-row";
import { AddRow } from "./add-row";

// Admin tab shell: one card of navigable rows over `items` (still loading
// while `items` is null) that ends in the row adding another, then a footer.
// With no items the add row stands alone, which is how iOS says "empty".
export function ListTab<T>({
  items,
  footer,
  createLabel,
  onEdit,
  onCreate,
  renderRow,
}: {
  items: T[] | null;
  footer: string;
  createLabel: string;
  onEdit: (id: string) => void;
  onCreate: () => void;
  renderRow: (item: T) => {
    id: string;
    title: string;
    subtitle: string;
    value?: string;
    // An `Avatar` to lead the row.
    avatar?: ReactNode;
  };
}) {
  if (items === null) return <LoadingState />;

  const rows = items.map(renderRow);

  return (
    <Stack>
      <Card>
        {rows.map((row) => (
          <NavRow
            key={row.id}
            title={row.title}
            subtitle={row.subtitle}
            value={row.value}
            avatar={row.avatar}
            onClick={() => onEdit(row.id)}
          />
        ))}
        <AddRow
          label={createLabel}
          onClick={onCreate}
          underAvatars={rows.some((r) => r.avatar)}
        />
      </Card>
      <SectionFooter>{footer}</SectionFooter>
    </Stack>
  );
}
