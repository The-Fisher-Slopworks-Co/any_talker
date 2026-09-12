// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { BotCommand, BotCommandScope } from "grammy/types";

export type SyncCommandsApi = {
  setMyCommands(
    commands: readonly BotCommand[],
    other?: { language_code?: string; scope?: BotCommandScope },
  ): Promise<unknown>;
};

// A menu entry plus one family-level flag of our own. `shared: true` marks a
// command whose behaviour does not depend on which bot of the family answers
// it — `/feedback` files the same report from the main bot and from every
// character bot, `/usage` reads the same family-wide windows — so a group
// holding several of them would otherwise show the same entry once per bot. Exactly one bot lists them per group chat; which one
// is resolved chat by chat in `bot/chat-commands.ts`.
export type FamilyCommand = BotCommand & { readonly shared?: true };

// The flag never leaves this module: Telegram only ever sees `BotCommand`.
function toBotCommands(list: readonly FamilyCommand[]): BotCommand[] {
  return list.map(({ shared: _shared, ...cmd }) => cmd);
}

// `is_ephemeral` earns `/feedback` and `/usage` their icon in the bot menu:
// outside a DM the reply is visible only to whoever sent it, and the menu says
// so up front. The group lists are the ones that carry it — see
// `withPlainReplies` for why the DM lists must not.
export const BOT_COMMANDS_EN: readonly FamilyCommand[] = [
  { command: "ask", description: "Ask (short answer)" },
  { command: "askwise", description: "Ask (detailed answer)" },
  {
    command: "feedback",
    description: "Report a problem",
    is_ephemeral: true,
    shared: true,
  },
  {
    command: "usage",
    description: "Your limits, in percent",
    is_ephemeral: true,
    shared: true,
  },
];

export const BOT_COMMANDS_RU: readonly FamilyCommand[] = [
  { command: "ask", description: "Спросить (коротко)" },
  { command: "askwise", description: "Спросить (подробно)" },
  {
    command: "feedback",
    description: "Сообщить о проблеме",
    is_ephemeral: true,
    shared: true,
  },
  {
    command: "usage",
    description: "Твои лимиты, в процентах",
    is_ephemeral: true,
    shared: true,
  },
];

// An ephemeral message is one only its receiver sees inside a chat of several,
// which a DM is not: there `replyEphemeral` answers with a plain reply. A menu
// entry promising the other thing is the reason a flagged command does not
// reach a private chat at all, so every DM list drops the flag — the commands
// themselves are unchanged.
function withPlainReplies(
  commands: readonly FamilyCommand[],
): readonly FamilyCommand[] {
  return commands.map(({ is_ephemeral: _ephemeral, ...plain }) => plain);
}

// Private chats list the same commands, none of them flagged ephemeral.
export const PRIVATE_COMMANDS_EN: readonly FamilyCommand[] =
  withPlainReplies(BOT_COMMANDS_EN);

export const PRIVATE_COMMANDS_RU: readonly FamilyCommand[] =
  withPlainReplies(BOT_COMMANDS_RU);

// The owner's own DM additionally lists `/digest`. Kept out of every other
// scope because the handler ignores non-owners anyway, and a menu entry that
// silently does nothing is worse than no entry.
export const OWNER_COMMANDS_EN: readonly FamilyCommand[] = [
  ...PRIVATE_COMMANDS_EN,
  { command: "digest", description: "Budget digest, now" },
];

export const OWNER_COMMANDS_RU: readonly FamilyCommand[] = [
  ...PRIVATE_COMMANDS_RU,
  { command: "digest", description: "Сводка по бюджету, сейчас" },
];

export const BOT_COMMAND_SCOPES: readonly BotCommandScope[] = [
  { type: "all_private_chats" },
  { type: "all_group_chats" },
  { type: "all_chat_administrators" },
];

export type SyncCommandsOptions = {
  // The owner's Telegram user id, if known: their own DM gets `/digest` on top.
  ownerId?: string | undefined;
};

// Whether this bot is the one that lists the shared commands among the given
// family bots: the one with the smallest id. Ids are Telegram user ids, so they
// are compared as numbers — "9999" must not outrank "10000". With no id to
// compare against (a lone bot, or an id we failed to learn) the commands stay:
// a duplicated menu entry is a nuisance, a missing one is a lost feature.
//
// The caller passes the bots of ONE chat (`bot/chat-commands.ts`), never the
// whole family: a family-wide winner need not be a member of the group being
// decided, and then nobody in it would list the command at all.
export function ownsSharedCommands(
  selfBotId: string | undefined,
  familyBotIds: readonly string[] | undefined,
): boolean {
  if (selfBotId === undefined) return true;
  const self = Number(selfBotId);
  if (!Number.isFinite(self)) return true;
  for (const id of familyBotIds ?? []) {
    const other = Number(id);
    if (Number.isFinite(other) && other < self) return false;
  }
  return true;
}

// The list a given scope gets: DM scopes see the private list, group scopes the
// base one. The default (scope-less) upload stays the base list — it is the
// fallback for chat types no explicit scope covers, all of them group-like.
//
// Every one of these lists carries the shared commands, the group-facing ones
// included. They are taken away one chat at a time, by a chat-scoped menu that
// outranks these (`bot/chat-commands.ts`), and only in a chat where a sibling
// family bot is present to list them instead. A chat this app has not seen yet
// therefore shows the command once per bot rather than not at all.
function commandsFor(
  scope: BotCommandScope | undefined,
  lang: "en" | "ru",
): BotCommand[] {
  const isPrivate = scope?.type === "all_private_chats";
  const ru = lang === "ru";
  const list = isPrivate
    ? ru
      ? PRIVATE_COMMANDS_RU
      : PRIVATE_COMMANDS_EN
    : ru
      ? BOT_COMMANDS_RU
      : BOT_COMMANDS_EN;
  return toBotCommands(list);
}

// The group list minus the shared commands: what a bot uploads under
// `BotCommandScopeChat` in a group where a smaller-id family bot lists them.
export function groupCommandsWithoutShared(lang: "en" | "ru"): BotCommand[] {
  const list = lang === "ru" ? BOT_COMMANDS_RU : BOT_COMMANDS_EN;
  return toBotCommands(list.filter((c) => !c.shared));
}

export async function syncBotCommands(
  api: SyncCommandsApi,
  opts: SyncCommandsOptions = {},
): Promise<void> {
  const fallbackEn = commandsFor(undefined, "en");
  const fallbackRu = commandsFor(undefined, "ru");
  await api.setMyCommands(fallbackEn);
  await api.setMyCommands(fallbackEn, { language_code: "en" });
  await api.setMyCommands(fallbackRu, { language_code: "ru" });
  for (const scope of BOT_COMMAND_SCOPES) {
    await api.setMyCommands(commandsFor(scope, "en"), { scope });
    await api.setMyCommands(commandsFor(scope, "en"), {
      scope,
      language_code: "en",
    });
    await api.setMyCommands(commandsFor(scope, "ru"), {
      scope,
      language_code: "ru",
    });
  }
  if (opts.ownerId === undefined) return;
  // A chat scope outranks `all_private_chats`, so this replaces (not appends
  // to) the default list in the owner's DM — hence spreading the base list.
  const scope: BotCommandScope = { type: "chat", chat_id: opts.ownerId };
  const ownerEn = toBotCommands(OWNER_COMMANDS_EN);
  const ownerRu = toBotCommands(OWNER_COMMANDS_RU);
  await api.setMyCommands(ownerEn, { scope });
  await api.setMyCommands(ownerEn, { scope, language_code: "en" });
  await api.setMyCommands(ownerRu, { scope, language_code: "ru" });
}
