// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Chat, User } from "grammy/types";

// Telegram's two fixed pseudo-accounts for a message sent *as a chat* rather
// than by its human author. They are Telegram-wide constants, identical in
// every chat and for every tenant:
//   - GroupAnonymousBot — an anonymous group admin ("send as the group").
//   - Channel_Bot — a channel posting or commenting under its own post in the
//     linked discussion group.
// The real sender is in `message.sender_chat`. Keying anything per-user on the
// pseudo-account id would merge every anonymous sender on the planet into one
// identity: one shared rate-limit window, one shared USD budget and spend
// ledger, one shared memory vault, one shared whitelist/blacklist entry. See
// `resolveSenderIdentity`, which is the only place allowed to decide this.
export const GROUP_ANONYMOUS_BOT_ID = 1087968824;
export const CHANNEL_BOT_ID = 136817688;

export type SenderIdentity = {
  // The id every per-user subsystem keys on: rate limit, budget guard and spend
  // ledger, user facts, timezone/gender/display name, whitelist and blacklist.
  // For a message sent on behalf of a chat this is that chat's own id, which is
  // negative and therefore can never collide with a real (positive) user id.
  userId: string;
  // Set only for a message sent on behalf of a chat, and then equal to
  // `userId`. The access gate uses it to consult the *chat* whitelist/blacklist
  // for the sending channel, which is where the admin UI files a chat.
  senderChatId: string | null;
  // What to call the sender in the prompt envelope — the chat's title when it
  // spoke as itself, so the model doesn't see "Channel_Bot".
  firstName: string | null;
  lastName: string | null;
};

function chatName(chat: Chat): string | null {
  if ("title" in chat && chat.title) return chat.title;
  if ("username" in chat && chat.username) return chat.username;
  return null;
}

// Resolves who a message is *from*, for every purpose other than display.
// `null` means "no usable identity" — ignore the message rather than guess.
export function resolveSenderIdentity(msg: {
  from?: User | undefined;
  sender_chat?: Chat | undefined;
}): SenderIdentity | null {
  const senderChat = msg.sender_chat;
  if (senderChat) {
    const id = String(senderChat.id);
    return {
      userId: id,
      senderChatId: id,
      firstName: chatName(senderChat),
      lastName: null,
    };
  }
  const from = msg.from;
  if (!from) return null;
  // A pseudo-account without a `sender_chat` should not exist (Telegram always
  // pairs them). If it ever arrives, there is nothing to scope the identity to,
  // so drop the message instead of falling back on the shared global id.
  if (from.id === GROUP_ANONYMOUS_BOT_ID || from.id === CHANNEL_BOT_ID) {
    return null;
  }
  return {
    userId: String(from.id),
    senderChatId: null,
    firstName: from.first_name ?? null,
    lastName: from.last_name ?? null,
  };
}
