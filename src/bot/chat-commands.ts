// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { BotCommandScope } from "grammy/types";
import type { Storage } from "../storage/types";
import {
  groupCommandsWithoutShared,
  ownsSharedCommands,
  type SyncCommandsApi,
} from "./commands";
import { BOT_PRESENCE_TTL_MS, isPresenceFresh } from "./routing";

// `setMyCommands` plus the half that takes a menu back: a chat-scoped list is
// removed with `deleteMyCommands` on the same scope, never by uploading a
// fuller one — an override that merely repeats the global list would still
// shadow every later change to it.
export type ChatCommandsApi = SyncCommandsApi & {
  deleteMyCommands(other?: {
    language_code?: string;
    scope?: BotCommandScope;
  }): Promise<unknown>;
};

// Only the two namespaces this module touches, so a test needs no full storage.
type MenuStorage = Pick<Storage, "presence" | "commandMenus">;

const MENU_LANGS = ["en", "ru"] as const;

// Uploads this bot's chat-scoped menu for one group. `BotCommandScopeChat`
// outranks both `all_chat_administrators` and `all_group_chats`, so these three
// calls cover everyone in the chat; the language-less one is what a user whose
// language is neither en nor ru falls back to.
async function uploadChatMenu(
  api: ChatCommandsApi,
  chatId: string,
): Promise<void> {
  const scope: BotCommandScope = { type: "chat", chat_id: chatId };
  await api.setMyCommands(groupCommandsWithoutShared("en"), { scope });
  for (const lang of MENU_LANGS) {
    await api.setMyCommands(groupCommandsWithoutShared(lang), {
      scope,
      language_code: lang,
    });
  }
}

// The exact inverse, so the chat falls back to the global group menu again.
async function removeChatMenu(
  api: ChatCommandsApi,
  chatId: string,
): Promise<void> {
  const scope: BotCommandScope = { type: "chat", chat_id: chatId };
  await api.deleteMyCommands({ scope });
  for (const lang of MENU_LANGS) {
    await api.deleteMyCommands({ scope, language_code: lang });
  }
}

export type ChatMenuSync = (args: {
  api: ChatCommandsApi;
  // A group chat. A DM holds exactly one bot, so nothing can duplicate there.
  chatId: string;
  // This bot's own Telegram id (`ctx.me.id`): the main bot does not know it
  // before its first `getMe`, so it is passed per call rather than stored.
  selfBotId: string;
  nowMs: number;
}) => Promise<void>;

// Reconciles this bot's chat-scoped menu in ONE group against who else is
// there:
//   - the smallest id among the family bots present lists everything and needs
//     no override — the global `all_group_chats` menu already carries the shared
//     commands, so an override left from an earlier resolution is deleted;
//   - every other bot uploads the group list minus the shared commands.
//
// Resolving it per chat is the point: the smallest id in the *family* need not
// be a member of this group, and a family-wide decision then hides `/feedback`
// from a group where the bot that was supposed to list it isn't present.
//
// The bots considered present are this one (it just received an update from the
// chat) plus every sibling in `siblingBotIds` with a fresh presence record.
// Restricting to the known siblings matters: a deleted managed bot keeps its
// presence entry until the TTL lapses, and a bot that no longer runs must not
// keep the command to itself.
//
// `commandMenus` is both the record that makes the overrides revertible and the
// memo that keeps a busy chat quiet — nothing is uploaded while the applied
// state already matches. Telegram is written first and the registry second, so
// a failure leaves at most a repeated (idempotent) upload for the next update
// to redo, never a row claiming an override that was never applied.
export function makeChatMenuSync(deps: {
  storage: MenuStorage;
  siblingBotIds?: (() => string[]) | undefined;
}): ChatMenuSync {
  return async ({ api, chatId, selfBotId, nowMs }) => {
    const siblings = deps.siblingBotIds?.() ?? [];
    const presence = await deps.storage.presence.get(chatId);
    const present = siblings.filter((id) =>
      isPresenceFresh(presence[id], nowMs, BOT_PRESENCE_TTL_MS),
    );
    const wanted = !ownsSharedCommands(selfBotId, present);
    const applied = await deps.storage.commandMenus.has(chatId, selfBotId);
    if (wanted === applied) return;
    if (wanted) {
      await uploadChatMenu(api, chatId);
      await deps.storage.commandMenus.record({
        chatId,
        botId: selfBotId,
        atMs: nowMs,
      });
      return;
    }
    await removeChatMenu(api, chatId);
    await deps.storage.commandMenus.forget(chatId, selfBotId);
  };
}

// This bot was removed from a chat: take its override back. Nobody there can see
// the menu any more, but Telegram keeps it — and a re-added bot would inherit a
// resolution made for a family that has moved on since.
export async function dropChatMenu(args: {
  api: ChatCommandsApi;
  storage: MenuStorage;
  chatId: string;
  selfBotId: string;
}): Promise<void> {
  const { storage, chatId, selfBotId } = args;
  if (!(await storage.commandMenus.has(chatId, selfBotId))) return;
  await removeChatMenu(args.api, chatId);
  await storage.commandMenus.forget(chatId, selfBotId);
}
