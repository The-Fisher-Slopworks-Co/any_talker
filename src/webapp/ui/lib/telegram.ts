// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

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
