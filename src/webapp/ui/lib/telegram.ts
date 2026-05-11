import type { User } from "../../../shared/types";

export function openTelegramProfile(u: User): void {
  const tg = window.Telegram?.WebApp;
  if (!tg) return;
  if (u.username) {
    tg.openTelegramLink?.(`https://t.me/${u.username}`);
    return;
  }
  tg.openLink?.(`tg://user?id=${u.id}`);
}
