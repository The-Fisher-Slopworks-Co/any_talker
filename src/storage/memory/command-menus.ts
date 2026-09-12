// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type {
  ChatCommandMenu,
  CommandMenusStore,
} from "../types/command-menus";
import type { Backing } from "../memory";

// Unscoped, like presence: every `forBot` view writes to the same per-chat map
// keyed by bot id.
export class MemoryCommandMenusStore implements CommandMenusStore {
  constructor(private readonly b: Backing) {}

  async record(menu: ChatCommandMenu): Promise<void> {
    let m = this.b.chatCommandMenus.get(menu.chatId);
    if (!m) {
      m = new Map();
      this.b.chatCommandMenus.set(menu.chatId, m);
    }
    m.set(menu.botId, menu.atMs);
  }

  async forget(chatId: string, botId: string): Promise<void> {
    const m = this.b.chatCommandMenus.get(chatId);
    if (!m) return;
    m.delete(botId);
    if (m.size === 0) this.b.chatCommandMenus.delete(chatId);
  }

  async has(chatId: string, botId: string): Promise<boolean> {
    return this.b.chatCommandMenus.get(chatId)?.has(botId) ?? false;
  }

  async list(): Promise<ChatCommandMenu[]> {
    const out: ChatCommandMenu[] = [];
    for (const [chatId, m] of this.b.chatCommandMenus) {
      for (const [botId, atMs] of m) out.push({ chatId, botId, atMs });
    }
    return out;
  }
}
