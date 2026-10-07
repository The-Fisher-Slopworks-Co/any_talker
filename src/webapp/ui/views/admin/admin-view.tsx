// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { Fragment } from "react";
import { useI18n } from "../../i18n-context";
import { api } from "../../api-client";
import type { AdminSummary } from "../../../../shared/types/admin-summary";
import { useLoadable } from "../../lib/use-loadable";
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

// The text at the right of a section's row, or the badge for what needs
// attention. Rows that carry no state (limits, prompt, spending) have neither.
function rowStatus(
  s: Strings,
  id: AdminSection,
  summary: AdminSummary | null,
): { value?: string; badge?: number; badgeLabel?: string } {
  if (!summary) return {};
  const onOff = (on: boolean) =>
    on ? s.ui_admin_value_on : s.ui_admin_value_off;
  switch (id) {
    case "bots":
      return { value: String(summary.bots) };
    case "budget":
      return { value: onOff(summary.budgetEnabled) };
    case "whitelist":
      return { value: onOff(summary.whitelistEnabled) };
    case "users":
      return { value: String(summary.users) };
    case "chats":
      return { value: String(summary.chats) };
    case "reminders":
      return { value: String(summary.reminders) };
    case "quarantine":
      return { value: String(summary.quarantined) };
    case "checks":
      return { value: String(summary.checks) };
    case "feedback":
      return {
        badge: summary.newFeedback,
        badgeLabel: s.ui_admin_new_count(summary.newFeedback),
      };
    case "api-token":
      return {
        value: summary.apiTokenCreated
          ? s.ui_admin_value_created
          : s.ui_admin_value_not_created,
      };
    case "prompt":
    case "ratelimit":
    case "spend":
      return {};
  }
}

export const adminSummaryLoad = {
  key: "admin-summary",
  load: () => api.getAdminSummary(),
};

// Shows at once and fills the values in when the summary arrives; if it never
// does, the rows simply stay bare.
export function AdminView({
  onOpenSection,
}: {
  onOpenSection: (section: AdminSection) => void;
}) {
  const { data } = useLoadable(adminSummaryLoad);
  return <AdminHome summary={data} onOpenSection={onOpenSection} />;
}

export function AdminHome({
  summary,
  onOpenSection,
}: {
  summary: AdminSummary | null;
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
                {...rowStatus(s, id, summary)}
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
