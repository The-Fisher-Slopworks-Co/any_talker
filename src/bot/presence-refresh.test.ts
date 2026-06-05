// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect } from "bun:test";
import type { Update } from "grammy/types";
import { shouldRefreshPresence } from "./index";

const CHAT = { id: -1001723761423, type: "supergroup", title: "Group" };
const USER = { id: 5, is_bot: false, first_name: "User" };
const MAIN_BOT = { id: 42, is_bot: true, first_name: "MainBot" };

// Build a `message` update carrying the given message fields.
function messageUpdate(fields: Record<string, unknown>): Update {
  return {
    update_id: 1,
    message: { message_id: 1, date: 0, chat: CHAT, from: USER, ...fields },
  } as unknown as Update;
}

test("refreshes on a normal text message", () => {
  expect(shouldRefreshPresence(messageUpdate({ text: "/ask hi" }))).toBe(true);
});

test("refreshes on media without a caption", () => {
  expect(
    shouldRefreshPresence(messageUpdate({ photo: [{ file_id: "x" }] })),
  ).toBe(true);
  expect(
    shouldRefreshPresence(messageUpdate({ voice: { file_id: "v" } })),
  ).toBe(true);
});

test("refreshes on edited content and callback queries", () => {
  expect(
    shouldRefreshPresence({
      update_id: 2,
      edited_message: { message_id: 1, date: 0, chat: CHAT, from: USER, text: "x" },
    } as unknown as Update),
  ).toBe(true);
  expect(
    shouldRefreshPresence({
      update_id: 3,
      callback_query: { id: "c", from: USER, chat_instance: "i", data: "d" },
    } as unknown as Update),
  ).toBe(true);
});

// The regression: when this bot is removed, it drains a burst of departure
// updates. None of them must refresh its presence, or a managed sibling stays
// silent on a bare `/ask` until the 7-day TTL lapses.
test("does NOT refresh on this bot's own my_chat_member removal", () => {
  const update = {
    update_id: 4,
    my_chat_member: {
      chat: CHAT,
      from: USER,
      date: 0,
      old_chat_member: { status: "member", user: MAIN_BOT },
      new_chat_member: { status: "left", user: MAIN_BOT },
    },
  } as unknown as Update;
  expect(shouldRefreshPresence(update)).toBe(false);
});

test("does NOT refresh on a my_chat_member add either (handler owns it)", () => {
  const update = {
    update_id: 5,
    my_chat_member: {
      chat: CHAT,
      from: USER,
      date: 0,
      old_chat_member: { status: "left", user: MAIN_BOT },
      new_chat_member: { status: "member", user: MAIN_BOT },
    },
  } as unknown as Update;
  expect(shouldRefreshPresence(update)).toBe(false);
});

test("does NOT refresh on the left_chat_member service message", () => {
  // The service broadcast both bots receive when the main bot is removed.
  expect(
    shouldRefreshPresence(messageUpdate({ left_chat_member: MAIN_BOT })),
  ).toBe(false);
});

test("does NOT refresh on other service messages", () => {
  expect(
    shouldRefreshPresence(messageUpdate({ new_chat_members: [MAIN_BOT] })),
  ).toBe(false);
  expect(
    shouldRefreshPresence(messageUpdate({ pinned_message: { message_id: 9 } })),
  ).toBe(false);
  expect(shouldRefreshPresence(messageUpdate({ new_chat_title: "t" }))).toBe(
    false,
  );
});
