// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../../i18n-context";
import { Card, Stack } from "../../components/layout";
import { NavRow } from "../../components/select-row";
import {
  ADMIN_SECTION_IDS,
  adminSection,
  type AdminSection,
} from "../../lib/routes";

export function AdminView({
  onOpenSection,
}: {
  onOpenSection: (section: AdminSection) => void;
}) {
  const { t: s } = useI18n();
  return (
    <Stack>
      <Card>
        {ADMIN_SECTION_IDS.map((id) => {
          const { label, description } = adminSection(s, id);
          return (
            <NavRow
              key={id}
              title={label}
              subtitle={description}
              onClick={() => onOpenSection(id)}
            />
          );
        })}
      </Card>
    </Stack>
  );
}
