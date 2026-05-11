import type { t } from "../../../shared/i18n";

export type Strings = ReturnType<typeof t>;

export type AdminSection =
  | "prompt"
  | "ratelimit"
  | "whitelist"
  | "users"
  | "chats"
  | "reminders";

export type Route =
  | { kind: "main" }
  | { kind: "admin" }
  | { kind: "admin-section"; section: AdminSection }
  | { kind: "user-edit"; userId: string; from: AdminSection }
  | { kind: "chat-edit"; chatId: string; from: AdminSection }
  | { kind: "my-reminders" };

export const ADMIN_SECTION_IDS: readonly AdminSection[] = [
  "prompt",
  "ratelimit",
  "whitelist",
  "users",
  "chats",
  "reminders",
];

export function adminSection(
  s: Strings,
  id: AdminSection,
): { label: string; description: string } {
  switch (id) {
    case "prompt":
      return { label: s.ui_admin_prompt, description: s.ui_admin_prompt_desc };
    case "ratelimit":
      return { label: s.ui_admin_limits, description: s.ui_admin_limits_desc };
    case "whitelist":
      return {
        label: s.ui_admin_whitelist,
        description: s.ui_admin_whitelist_desc,
      };
    case "users":
      return { label: s.ui_admin_users, description: s.ui_admin_users_desc };
    case "chats":
      return { label: s.ui_admin_chats, description: s.ui_admin_chats_desc };
    case "reminders":
      return {
        label: s.ui_admin_reminders,
        description: s.ui_admin_reminders_desc,
      };
  }
}
