// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { Fragment } from "react";
import { useI18n } from "../../i18n-context";
import { Card, SectionHeader, Stack } from "../../components/layout";
import { NavRow } from "../../components/select-row";
import {
  SettingsIcon,
  type GLYPHS,
  type IconTint,
} from "../../components/settings-icon";
import {
  ADMIN_GROUPS,
  adminSectionLabel,
  type AdminGroup,
  type AdminSection,
  type Strings,
} from "../../lib/routes";

// Each section's icon. A Record, so a new section cannot ship without one.
export const ADMIN_SECTION_ICONS: Record<
  AdminSection,
  { tint: IconTint; glyph: keyof typeof GLYPHS }
> = {
  prompt: { tint: "purple", glyph: "memory" },
  bots: { tint: "indigo", glyph: "person" },
  ratelimit: { tint: "orange", glyph: "gauge" },
  budget: { tint: "green", glyph: "shieldDollar" },
  spend: { tint: "teal", glyph: "chart" },
  whitelist: { tint: "blue", glyph: "shieldCheck" },
  users: { tint: "gray", glyph: "people" },
  chats: { tint: "green", glyph: "bubbles" },
  reminders: { tint: "orange", glyph: "bell" },
  quarantine: { tint: "red", glyph: "warning" },
  checks: { tint: "green", glyph: "checkmark" },
  feedback: { tint: "pink", glyph: "envelope" },
  "api-token": { tint: "gray", glyph: "key" },
};

function groupHeader(s: Strings, group: AdminGroup): string {
  switch (group) {
    case "spending":
      return s.ui_admin_group_spending;
    case "access":
      return s.ui_admin_group_access;
    case "automation":
      return s.ui_admin_group_automation;
  }
}

export function AdminView({
  onOpenSection,
}: {
  onOpenSection: (section: AdminSection) => void;
}) {
  const { t: s } = useI18n();
  return (
    <Stack>
      {ADMIN_GROUPS.map(({ header, sections }, i) => {
        const card = (
          <Card>
            {sections.map((id) => (
              <NavRow
                key={id}
                title={adminSectionLabel(s, id)}
                icon={<SettingsIcon {...ADMIN_SECTION_ICONS[id]} />}
                onClick={() => onOpenSection(id)}
              />
            ))}
          </Card>
        );
        return header ? (
          <Fragment key={i}>
            <SectionHeader>{groupHeader(s, header)}</SectionHeader>
            {card}
          </Fragment>
        ) : (
          <div key={i} className="section-gap">
            {card}
          </div>
        );
      })}
    </Stack>
  );
}
