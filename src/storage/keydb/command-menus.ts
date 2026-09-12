// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { RedisClient } from "bun";
import type {
  ChatCommandMenu,
  CommandMenusStore,
} from "../types/command-menus";
import { PREFIX } from "./shared";

// One global hash (unscoped, like `bot_presence`), field = `{chatId}:{botId}`,
// value = the epoch ms the menu was applied. A single key rather than one per
// chat so the rollback list is one `hgetall` and never a key scan.
const KEY = `${PREFIX}chat_command_menus`;

// A chat id is `-100…`-shaped and a bot id is digits, so the last ":" always
// separates the two.
function field(chatId: string, botId: string): string {
  return `${chatId}:${botId}`;
}

export class KeyDBCommandMenusStore implements CommandMenusStore {
  constructor(private readonly client: RedisClient) {}

  async record(menu: ChatCommandMenu): Promise<void> {
    await this.client.hset(
      KEY,
      field(menu.chatId, menu.botId),
      String(menu.atMs),
    );
  }

  async forget(chatId: string, botId: string): Promise<void> {
    await this.client.hdel(KEY, field(chatId, botId));
  }

  async has(chatId: string, botId: string): Promise<boolean> {
    return (await this.client.hget(KEY, field(chatId, botId))) !== null;
  }

  async list(): Promise<ChatCommandMenu[]> {
    const raw = await this.client.hgetall(KEY);
    const out: ChatCommandMenu[] = [];
    for (const [key, ms] of Object.entries(raw)) {
      const sep = key.lastIndexOf(":");
      if (sep <= 0) continue;
      const atMs = Number(ms);
      out.push({
        chatId: key.slice(0, sep),
        botId: key.slice(sep + 1),
        atMs: Number.isFinite(atMs) ? atMs : 0,
      });
    }
    return out;
  }
}
