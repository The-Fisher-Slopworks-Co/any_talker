// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import {
  resolveSenderIdentity,
  CHANNEL_BOT_ID,
  GROUP_ANONYMOUS_BOT_ID,
} from "./identity";

const user = {
  id: 42,
  is_bot: false,
  first_name: "Jane",
  last_name: "Doe",
};

const channelBot = { id: CHANNEL_BOT_ID, is_bot: true, first_name: "Channel" };
const anonBot = {
  id: GROUP_ANONYMOUS_BOT_ID,
  is_bot: true,
  first_name: "Group",
};

describe("resolveSenderIdentity", () => {
  test("a normal user is themselves", () => {
    expect(resolveSenderIdentity({ from: user })).toEqual({
      userId: "42",
      senderChatId: null,
      firstName: "Jane",
      lastName: "Doe",
    });
  });

  test("no from and no sender_chat yields no identity", () => {
    expect(resolveSenderIdentity({})).toBeNull();
  });

  test("a channel commenting as itself is the channel, not Channel_Bot", () => {
    const identity = resolveSenderIdentity({
      from: channelBot,
      sender_chat: { id: -1001, type: "channel", title: "News" },
    });
    expect(identity).toEqual({
      userId: "-1001",
      senderChatId: "-1001",
      firstName: "News",
      lastName: null,
    });
  });

  test("an anonymous group admin is the group, not GroupAnonymousBot", () => {
    const identity = resolveSenderIdentity({
      from: anonBot,
      sender_chat: { id: -1002, type: "supergroup", title: "Council" },
    });
    expect(identity).toEqual({
      userId: "-1002",
      senderChatId: "-1002",
      firstName: "Council",
      lastName: null,
    });
  });

  // The whole point of the module: these two pseudo-accounts are Telegram-wide
  // constants, so identifying by them would pool unrelated tenants into one
  // rate-limit / budget / memory / whitelist bucket.
  test("two different channels posting anonymously never share an identity", () => {
    const a = resolveSenderIdentity({
      from: channelBot,
      sender_chat: { id: -1001, type: "channel", title: "News" },
    });
    const b = resolveSenderIdentity({
      from: channelBot,
      sender_chat: { id: -2002, type: "channel", title: "Sports" },
    });
    expect(a?.userId).toBe("-1001");
    expect(b?.userId).toBe("-2002");
    expect(a?.userId).not.toBe(b?.userId);
    expect([a?.userId, b?.userId]).not.toContain(String(CHANNEL_BOT_ID));
  });

  test("an anonymous sender is never confused with a real user id", () => {
    const anon = resolveSenderIdentity({
      from: anonBot,
      sender_chat: { id: -1002, type: "supergroup", title: "Council" },
    });
    expect(anon?.userId).not.toBe(
      resolveSenderIdentity({ from: user })?.userId,
    );
    expect(anon?.senderChatId).not.toBeNull();
    expect(resolveSenderIdentity({ from: user })?.senderChatId).toBeNull();
  });

  // Every sending chat Telegram actually sends carries a title; the fallback
  // exists because the `Chat` type also covers title-less variants.
  test("falls back to the username when the sending chat has no title", () => {
    const identity = resolveSenderIdentity({
      from: channelBot,
      sender_chat: {
        id: -1003,
        type: "private",
        username: "newsfeed",
        first_name: "News",
      },
    });
    expect(identity?.firstName).toBe("newsfeed");
  });

  // Telegram always pairs a pseudo-account with `sender_chat`; if it ever did
  // not, there is nothing to scope the identity to.
  test("a bare pseudo-account with no sender_chat is dropped", () => {
    expect(resolveSenderIdentity({ from: channelBot })).toBeNull();
    expect(resolveSenderIdentity({ from: anonBot })).toBeNull();
  });

  test("an ordinary bot keeps its own (per-bot, non-shared) id", () => {
    const identity = resolveSenderIdentity({
      from: { id: 999, is_bot: true, first_name: "SomeBot" },
    });
    expect(identity?.userId).toBe("999");
  });
});
