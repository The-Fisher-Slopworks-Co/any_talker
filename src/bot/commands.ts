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
// character bot — so a group holding several of them would otherwise show the
// same entry once per bot. Shared commands are listed in group chats by a
// single bot; see `ownsSharedCommands`.
export type FamilyCommand = BotCommand & { readonly shared?: true };

// The flag never leaves this module: Telegram only ever sees `BotCommand`.
function toBotCommands(list: readonly FamilyCommand[]): BotCommand[] {
  return list.map(({ shared: _shared, ...cmd }) => cmd);
}

// `is_ephemeral` earns `/feedback` its icon in the bot menu: outside a DM the
// reply is visible only to whoever sent it, and the menu says so up front. The
// group lists are the ones that carry it — see `withPlainFeedback` for why the
// DM lists must not.
export const BOT_COMMANDS_EN: readonly FamilyCommand[] = [
  { command: "ask", description: "Ask (short answer)" },
  { command: "askwise", description: "Ask (detailed answer)" },
  {
    command: "feedback",
    description: "Report a problem",
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
];

// An ephemeral message is one only its receiver sees inside a chat of several,
// which a DM is not: there `dispatchFeedbackCommand` answers with a plain
// reply. A menu entry promising the other thing is the reason `/feedback` does
// not reach a private chat at all, so every DM list drops the flag — the
// command itself is unchanged.
function withPlainFeedback(
  commands: readonly FamilyCommand[],
): readonly FamilyCommand[] {
  return commands.map((cmd) => {
    if (cmd.command !== "feedback") return cmd;
    const { is_ephemeral: _ephemeral, ...plain } = cmd;
    return plain;
  });
}

// Private chats additionally list `/usage`. It is DM-only (the handler ignores
// it in groups — how close you are to your limit is nobody else's business), so
// listing it in the group menus would advertise an entry that does nothing.
export const PRIVATE_COMMANDS_EN: readonly FamilyCommand[] = [
  ...withPlainFeedback(BOT_COMMANDS_EN),
  { command: "usage", description: "Your limits, in percent" },
];

export const PRIVATE_COMMANDS_RU: readonly FamilyCommand[] = [
  ...withPlainFeedback(BOT_COMMANDS_RU),
  { command: "usage", description: "Твои лимиты, в процентах" },
];

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
  // This bot's own Telegram id, plus the ids of every family bot currently
  // running (this one included). Together they decide who lists the shared
  // commands in groups.
  selfBotId?: string | undefined;
  familyBotIds?: readonly string[] | undefined;
};

// Whether this bot is the one that lists the shared commands in group chats:
// the family member with the smallest id. Ids are Telegram user ids, so they
// are compared as numbers — "9999" must not outrank "10000". With no id to
// compare against (a lone bot, or an id we failed to learn) the commands stay:
// a duplicated menu entry is a nuisance, a missing one is a lost feature.
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
// A DM holds exactly one bot, so nothing can duplicate there; only the
// group-facing scopes (the default included) drop the shared commands when
// another family bot with a smaller id already lists them.
function commandsFor(
  scope: BotCommandScope | undefined,
  lang: "en" | "ru",
  opts: SyncCommandsOptions,
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
  if (isPrivate || ownsSharedCommands(opts.selfBotId, opts.familyBotIds))
    return toBotCommands(list);
  return toBotCommands(list.filter((c) => !c.shared));
}

export async function syncBotCommands(
  api: SyncCommandsApi,
  opts: SyncCommandsOptions = {},
): Promise<void> {
  const fallbackEn = commandsFor(undefined, "en", opts);
  const fallbackRu = commandsFor(undefined, "ru", opts);
  await api.setMyCommands(fallbackEn);
  await api.setMyCommands(fallbackEn, { language_code: "en" });
  await api.setMyCommands(fallbackRu, { language_code: "ru" });
  for (const scope of BOT_COMMAND_SCOPES) {
    await api.setMyCommands(commandsFor(scope, "en", opts), { scope });
    await api.setMyCommands(commandsFor(scope, "en", opts), {
      scope,
      language_code: "en",
    });
    await api.setMyCommands(commandsFor(scope, "ru", opts), {
      scope,
      language_code: "ru",
    });
  }
  if (opts.ownerId === undefined) return;
  // A chat scope outranks `all_private_chats`, so this replaces (not appends
  // to) the default list in the owner's DM — hence spreading the base list.
  // That DM is one-on-one, so it keeps the shared commands unconditionally.
  const scope: BotCommandScope = { type: "chat", chat_id: opts.ownerId };
  const ownerEn = toBotCommands(OWNER_COMMANDS_EN);
  const ownerRu = toBotCommands(OWNER_COMMANDS_RU);
  await api.setMyCommands(ownerEn, { scope });
  await api.setMyCommands(ownerEn, { scope, language_code: "en" });
  await api.setMyCommands(ownerRu, { scope, language_code: "ru" });
}
