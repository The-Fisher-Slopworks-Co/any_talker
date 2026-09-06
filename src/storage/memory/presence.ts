// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { PresenceStore } from "../types/presence";
import type { Backing } from "../memory";

// Presence is a shared registry (unscoped): every `forBot` view writes to the
// same per-chat map keyed by bot id, so a managed bot can observe the main
// bot's (and siblings') presence regardless of which scope it is called on.
export class MemoryPresenceStore implements PresenceStore {
  constructor(private readonly b: Backing) {}

  async record(chatId: string, botId: string, atMs: number): Promise<void> {
    let m = this.b.botPresence.get(chatId);
    if (!m) {
      m = new Map();
      this.b.botPresence.set(chatId, m);
    }
    m.set(botId, atMs);
  }

  async remove(chatId: string, botId: string): Promise<void> {
    this.b.botPresence.get(chatId)?.delete(botId);
  }

  async get(chatId: string): Promise<Record<string, number>> {
    const m = this.b.botPresence.get(chatId);
    return m ? Object.fromEntries(m) : {};
  }
}
