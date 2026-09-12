// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "../storage/types";
import { ownsSharedCommands } from "./commands";
import { isPresenceFresh, BOT_PRESENCE_TTL_MS } from "./routing";
import type { BotContext } from "./middleware/lang";

// A *shared* command (`FamilyCommand` in `commands.ts` — `/feedback` is the
// only one) does the same thing whichever bot of the family runs it, and a
// group may hold several of them. Telegram delivers a slash command to every
// bot in the chat, so a bare `/feedback broke` matched all of them: N identical
// reports filed, N ephemeral confirmations sent, N times the reporter's daily
// allowance spent. Exactly one bot must act on it.
//
// Which one mirrors the group menu: the family bot that LISTS the shared
// commands is the one with the smallest id (`ownsSharedCommands`), so the one
// that ACTS on a bare shared command is the same — narrowed to the bots
// actually in this chat. The narrowing is what keeps the report from going
// nowhere: the family-wide owner need not be a member of this particular group,
// and then the smallest id that *is* takes it.
export function handlesSharedCommand(args: {
  // The command named this bot (`/feedback@self`). Nobody else matched it, so
  // this bot acts regardless of who else is here.
  explicit: boolean;
  chatType: string | undefined;
  selfBotId: string;
  // The OTHER family bots (for the main bot: the managed ones; for a managed
  // bot: the main bot + every other managed bot).
  siblingBotIds: readonly string[];
  // The chat's presence map, `null` when it could not be read.
  presence: Record<string, number> | null;
  nowMs: number;
}): boolean {
  if (args.explicit) return true;
  // A DM holds exactly one bot; nothing there can duplicate.
  if (args.chatType === "private") return true;
  const present = args.siblingBotIds.filter((id) =>
    isPresenceFresh(args.presence?.[id], args.nowMs, BOT_PRESENCE_TTL_MS),
  );
  return ownsSharedCommands(args.selfBotId, [args.selfBotId, ...present]);
}

// Whether this bot acts on a matched shared command. Fails OPEN, deliberately
// the opposite of the alone-check in `makeShouldAnswer`: an unreadable presence
// map (storage error) or a sibling with no fresh record reads as "not here", so
// this bot takes the report. The failure modes are not symmetric — a duplicated
// report is the nuisance this gate removes, a dropped one is a bug report the
// user watched the bot confirm and nobody ever receives.
export function makeShouldHandleSharedCommand(args: {
  storage: Storage;
  siblingBotIds?: (() => string[]) | undefined;
}): (ctx: BotContext, explicit: boolean) => Promise<boolean> {
  return async (ctx: BotContext, explicit: boolean): Promise<boolean> => {
    const chatId = ctx.chat?.id;
    const chatType = ctx.chat?.type;
    // Both are decided without presence, so skip the read.
    if (explicit || chatType === "private" || chatId === undefined) return true;
    let presence: Record<string, number> | null = null;
    try {
      presence = await args.storage.presence.get(String(chatId));
    } catch (err) {
      console.error("presence.get failed:", err);
    }
    return handlesSharedCommand({
      explicit,
      chatType,
      selfBotId: String(ctx.me.id),
      siblingBotIds: args.siblingBotIds?.() ?? [],
      presence,
      nowMs: Date.now(),
    });
  };
}
