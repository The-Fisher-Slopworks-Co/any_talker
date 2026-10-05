// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { t } from "../../../shared/i18n";

export type Strings = ReturnType<typeof t>;

export type AdminSection =
  | "prompt"
  | "ratelimit"
  | "budget"
  | "spend"
  | "whitelist"
  | "users"
  | "chats"
  | "reminders"
  | "quarantine"
  | "checks"
  | "bots"
  | "feedback"
  | "api-token";

export type Route =
  | { kind: "main" }
  | { kind: "admin" }
  | { kind: "admin-section"; section: AdminSection }
  | { kind: "user-edit"; userId: string; from: AdminSection }
  | { kind: "chat-edit"; chatId: string; from: AdminSection }
  | { kind: "check-edit"; checkId: string | null }
  | { kind: "managed-bot-edit"; botId: string | null }
  // Read-only apart from the status, so it is a view rather than an `-edit`.
  | { kind: "feedback-view"; feedbackId: string }
  | { kind: "my-reminders" }
  | { kind: "my-facts" };

// The usage header (the viewer's own 5-hour / weekly bars) belongs to the
// settings home only: on every other screen it is a repeated, unrelated card
// above the content the user actually opened.
export function showsUsageHeader(route: Route): boolean {
  return route.kind === "main";
}

// The admin home's groups, top to bottom. A null header is a headerless
// group, like the top block of iOS Settings.
export type AdminGroup = "spending" | "access" | "automation";

export const ADMIN_GROUPS: readonly {
  header: AdminGroup | null;
  sections: readonly AdminSection[];
}[] = [
  { header: null, sections: ["prompt", "bots"] },
  { header: "spending", sections: ["ratelimit", "budget", "spend"] },
  { header: "access", sections: ["whitelist", "users", "chats"] },
  { header: "automation", sections: ["reminders", "quarantine", "checks"] },
  { header: null, sections: ["feedback", "api-token"] },
];

export const ADMIN_SECTION_IDS: readonly AdminSection[] = ADMIN_GROUPS.flatMap(
  (g) => g.sections,
);

function isAdminSection(v: unknown): v is AdminSection {
  return ADMIN_SECTION_IDS.includes(v as AdminSection);
}

function isId(v: unknown): v is string {
  return typeof v === "string" && v !== "";
}

// A route read back from storage after a reload. Anything that is not a
// route this build knows how to render gives null.
export function parseRoute(raw: unknown): Route | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  switch (r.kind) {
    case "main":
    case "admin":
    case "my-reminders":
    case "my-facts":
      return { kind: r.kind };
    case "admin-section":
      return isAdminSection(r.section)
        ? { kind: r.kind, section: r.section }
        : null;
    case "user-edit":
      return isId(r.userId) && isAdminSection(r.from)
        ? { kind: r.kind, userId: r.userId, from: r.from }
        : null;
    case "chat-edit":
      return isId(r.chatId) && isAdminSection(r.from)
        ? { kind: r.kind, chatId: r.chatId, from: r.from }
        : null;
    case "check-edit":
      return r.checkId === null || isId(r.checkId)
        ? { kind: r.kind, checkId: r.checkId }
        : null;
    case "managed-bot-edit":
      return r.botId === null || isId(r.botId)
        ? { kind: r.kind, botId: r.botId }
        : null;
    case "feedback-view":
      return isId(r.feedbackId)
        ? { kind: r.kind, feedbackId: r.feedbackId }
        : null;
    default:
      return null;
  }
}

export function adminSectionLabel(s: Strings, id: AdminSection): string {
  switch (id) {
    case "prompt":
      return s.ui_admin_prompt;
    case "ratelimit":
      return s.ui_admin_limits;
    case "budget":
      return s.ui_admin_budget;
    case "spend":
      return s.ui_admin_spend;
    case "whitelist":
      return s.ui_admin_whitelist;
    case "users":
      return s.ui_admin_users;
    case "chats":
      return s.ui_admin_chats;
    case "reminders":
      return s.ui_admin_reminders;
    case "quarantine":
      return s.ui_admin_quarantine;
    case "checks":
      return s.ui_admin_checks;
    case "bots":
      return s.ui_admin_bots;
    case "feedback":
      return s.ui_admin_feedback;
    case "api-token":
      return s.ui_admin_api_token;
  }
}
