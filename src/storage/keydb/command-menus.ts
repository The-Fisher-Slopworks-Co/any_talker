// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { RedisClient } from "bun";
import type {
  ChatCommandMenu,
  CommandMenusStore,
} from "../types/command-menus";
import { PREFIX } from "./shared";

// One global hash (unscoped, like `bot_presence`), field = `{chatId}:{botId}`,
// value = JSON `{ atMs, version }`. A single key rather than one per chat so the
// rollback list is one `hgetall` and never a key scan.
const KEY = `${PREFIX}chat_command_menus`;

// A chat id is `-100…`-shaped and a bot id is digits, so the last ":" always
// separates the two.
function field(chatId: string, botId: string): string {
  return `${chatId}:${botId}`;
}

type StoredMenu = Pick<ChatCommandMenu, "atMs" | "version">;

// Rows written before `version` existed hold the bare epoch ms, which parses as
// a JSON number: they come back version-less, i.e. as a menu to re-upload.
export function parseValue(raw: string): StoredMenu {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { atMs: 0 };
  }
  if (typeof parsed === "number") {
    return { atMs: Number.isFinite(parsed) ? parsed : 0 };
  }
  if (typeof parsed !== "object" || parsed === null) return { atMs: 0 };
  const { atMs, version } = parsed as Record<string, unknown>;
  const out: StoredMenu = {
    atMs: typeof atMs === "number" && Number.isFinite(atMs) ? atMs : 0,
  };
  if (typeof version === "string") out.version = version;
  return out;
}

export class KeyDBCommandMenusStore implements CommandMenusStore {
  constructor(private readonly client: RedisClient) {}

  async record(menu: ChatCommandMenu): Promise<void> {
    await this.client.hset(
      KEY,
      field(menu.chatId, menu.botId),
      JSON.stringify({ atMs: menu.atMs, version: menu.version }),
    );
  }

  async forget(chatId: string, botId: string): Promise<void> {
    await this.client.hdel(KEY, field(chatId, botId));
  }

  async has(chatId: string, botId: string): Promise<boolean> {
    return (await this.client.hget(KEY, field(chatId, botId))) !== null;
  }

  async get(chatId: string, botId: string): Promise<ChatCommandMenu | null> {
    const raw = await this.client.hget(KEY, field(chatId, botId));
    return raw === null ? null : { chatId, botId, ...parseValue(raw) };
  }

  async list(): Promise<ChatCommandMenu[]> {
    const raw = await this.client.hgetall(KEY);
    const out: ChatCommandMenu[] = [];
    for (const [key, value] of Object.entries(raw)) {
      const sep = key.lastIndexOf(":");
      if (sep <= 0) continue;
      out.push({
        chatId: key.slice(0, sep),
        botId: key.slice(sep + 1),
        ...parseValue(value),
      });
    }
    return out;
  }
}
