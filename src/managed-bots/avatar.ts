// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { InputFile, type Api } from "grammy";

// Sets a managed bot's profile photo via setMyProfilePhoto (Bot API 9.4+),
// called with THAT bot's own api. Best-effort: returns false on failure (the
// method is rate-limited and a failed avatar must never abort bot startup or
// fail an admin request that otherwise succeeded).
export async function setManagedBotAvatar(
  api: Api,
  bytes: Uint8Array,
): Promise<boolean> {
  try {
    await api.setMyProfilePhoto({ type: "static", photo: new InputFile(bytes) });
    return true;
  } catch (err) {
    console.error("[managed-bots] setMyProfilePhoto failed:", err);
    return false;
  }
}
