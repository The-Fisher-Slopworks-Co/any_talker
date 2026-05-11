import type { Strings } from "./routes";
import { composeFullName, type Chat, type User } from "../../../shared/types";
import type { Reminder } from "../../../reminders/types";
import type { Lang } from "../../../shared/i18n";

export function chatTitle(s: Strings, c: Chat): string {
  if (c.title && c.title.length > 0) return c.title;
  if (c.username) return `@${c.username}`;
  if (c.type === "private") return s.ui_chat_private;
  return `id:${c.id}`;
}

export function chatSubtitle(c: Chat): string {
  return c.username && c.title ? `${c.type} · @${c.username}` : c.type;
}

export function userDisplayName(u: User): string {
  return composeFullName(u.firstName, u.lastName) || `id:${u.id}`;
}

export function reminderTargetLabel(
  s: Strings,
  r: Reminder,
  chats: Record<string, Chat>,
): string {
  if (r.target.kind === "guest_dm") return s.ui_reminders_dm;
  const chat = chats[r.target.chatId];
  if (chat) return chatTitle(s, chat);
  return s.ui_reminders_chat_fallback(r.target.chatId);
}

export function reminderUserLabel(
  r: Reminder,
  users: Record<string, User> | undefined,
): { primary: string; secondary: string | null } {
  const u = users?.[r.userId];
  if (!u) return { primary: `id ${r.userId}`, secondary: null };
  return {
    primary: userDisplayName(u),
    secondary: u.username ? `@${u.username}` : `id ${u.id}`,
  };
}

export const LANG_LABEL_KEY = {
  en: "ui_main_lang_english",
  ru: "ui_main_lang_russian",
} as const satisfies Record<Lang, keyof Strings>;
