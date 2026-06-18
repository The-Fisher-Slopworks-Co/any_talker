// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect } from "bun:test";
import {
  matchAsk,
  askGate,
  classifyReplyTarget,
  computeAlone,
  isPresenceFresh,
  BOT_PRESENCE_TTL_MS,
  type AskMatch,
} from "./index";

const SELF = "MainBot";

test("matchAsk parses bare and @self, marking explicit", () => {
  expect(matchAsk("/ask hello", SELF)).toMatchObject({
    userText: "hello",
    detailLevel: "short",
    explicit: false,
  });
  expect(matchAsk("/ask@MainBot hello", SELF)).toMatchObject({
    userText: "hello",
    explicit: true,
  });
  // case-insensitive self-mention
  expect(matchAsk("/ask@mainbot hello", SELF)?.explicit).toBe(true);
  expect(matchAsk("/askwise foo", SELF)?.detailLevel).toBe("wise");
});

test("matchAsk rejects a command aimed at a DIFFERENT bot", () => {
  // The cross-bot caption leak fix: a `/ask@CatBot` is not the main bot's.
  expect(matchAsk("/ask@CatBot hello", SELF)).toBeNull();
  expect(matchAsk("/ask@OtherBot feed me", "CatBot")).toBeNull();
  // A username that merely starts with the same prefix must not match.
  expect(matchAsk("/ask@CatBotBackup feed me", "CatBot")).toBeNull();
});

test("matchAsk returns null for non-ask text", () => {
  expect(matchAsk("hello there", SELF)).toBeNull();
  expect(matchAsk("/start", SELF)).toBeNull();
});

test("isPresenceFresh: undefined is never fresh; TTL boundary is inclusive", () => {
  const now = 10 * BOT_PRESENCE_TTL_MS;
  // No record at all → never fresh.
  expect(isPresenceFresh(undefined, now, BOT_PRESENCE_TTL_MS)).toBe(false);
  // Seen just now → fresh.
  expect(isPresenceFresh(now, now, BOT_PRESENCE_TTL_MS)).toBe(true);
  // Exactly at the TTL boundary still counts as fresh.
  expect(
    isPresenceFresh(now - BOT_PRESENCE_TTL_MS, now, BOT_PRESENCE_TTL_MS),
  ).toBe(true);
  // One ms past the TTL → stale.
  expect(
    isPresenceFresh(now - BOT_PRESENCE_TTL_MS - 1, now, BOT_PRESENCE_TTL_MS),
  ).toBe(false);
});

const bare: AskMatch = { detailLevel: "short", userText: "", explicit: false };
const explicit: AskMatch = { detailLevel: "short", userText: "", explicit: true };

test("askGate: an explicit @self mention is always answered", () => {
  expect(askGate(explicit, true, "group", "other")).toBe("answer");
  expect(askGate(explicit, true, "private", "other")).toBe("answer");
  expect(askGate(explicit, false, "supergroup", "other")).toBe("answer");
  // An explicit mention wins even over a reply to a sibling's message.
  expect(askGate(explicit, true, "group", "sibling")).toBe("answer");
});

test("askGate: the main bot answers a bare /ask everywhere", () => {
  expect(askGate(bare, false, "group", "other")).toBe("answer");
  expect(askGate(bare, false, "private", "other")).toBe("answer");
});

test("askGate: a managed bot answers a bare /ask in its DM, checks alone in a group", () => {
  expect(askGate(bare, true, "private", "other")).toBe("answer");
  expect(askGate(bare, true, "group", "other")).toBe("check-alone");
  expect(askGate(bare, true, "supergroup", "other")).toBe("check-alone");
  expect(askGate(bare, true, undefined, "other")).toBe("check-alone");
});

test("askGate: a bare /ask replying to THIS bot's own message is always answered", () => {
  // The user replied to this bot's message — they are addressing it directly, so
  // it answers even in a group with siblings present (managed) or by default (main).
  expect(askGate(bare, true, "group", "self")).toBe("answer");
  expect(askGate(bare, true, "supergroup", "self")).toBe("answer");
  expect(askGate(bare, false, "group", "self")).toBe("answer");
});

test("askGate: a bare /ask replying to a present SIBLING family bot's message is skipped", () => {
  // The bug fix: the main bot must NOT answer a bare /ask sent in reply to a
  // present character bot's message — it defers ("skip") so that character
  // answers; a managed bot likewise defers when the reply is to a different
  // present family bot.
  expect(askGate(bare, false, "group", "sibling")).toBe("skip");
  expect(askGate(bare, false, "supergroup", "sibling")).toBe("skip");
  expect(askGate(bare, true, "group", "sibling")).toBe("skip");
  expect(askGate(bare, true, "private", "sibling")).toBe("skip");
});

test("computeAlone: alone when no sibling has a fresh presence record", () => {
  const now = 1_000_000;
  // No siblings present at all → alone.
  expect(computeAlone(["100", "200"], {}, now, BOT_PRESENCE_TTL_MS)).toBe(true);
  // A sibling seen just now → not alone.
  expect(
    computeAlone(["100"], { "100": now }, now, BOT_PRESENCE_TTL_MS),
  ).toBe(false);
  // A different bot present, but not one of our siblings → still alone.
  expect(
    computeAlone(["100"], { "999": now }, now, BOT_PRESENCE_TTL_MS),
  ).toBe(true);
});

test("computeAlone: a stale presence entry is ignored (treated as absent)", () => {
  const now = 10 * BOT_PRESENCE_TTL_MS;
  const stale = now - BOT_PRESENCE_TTL_MS - 1;
  expect(computeAlone(["100"], { "100": stale }, now, BOT_PRESENCE_TTL_MS)).toBe(
    true,
  );
  // Exactly at the TTL boundary still counts as present.
  const edge = now - BOT_PRESENCE_TTL_MS;
  expect(computeAlone(["100"], { "100": edge }, now, BOT_PRESENCE_TTL_MS)).toBe(
    false,
  );
});

test("computeAlone: no siblings configured ⇒ alone", () => {
  expect(computeAlone([], { "1": 1, "2": 2 }, 100, BOT_PRESENCE_TTL_MS)).toBe(
    true,
  );
});

// Every family bot is present unless `isSiblingPresent` says otherwise.
const allPresent = () => true;
const nonePresent = () => false;

test("classifyReplyTarget: own message ⇒ self, present family sibling ⇒ sibling, else other", () => {
  const SELF_ID = 42;
  const SIBLINGS = ["100", "200"];
  expect(classifyReplyTarget(42, SELF_ID, SIBLINGS, allPresent)).toBe("self");
  expect(classifyReplyTarget(100, SELF_ID, SIBLINGS, allPresent)).toBe("sibling");
  expect(classifyReplyTarget(200, SELF_ID, SIBLINGS, allPresent)).toBe("sibling");
  // A human or an unrelated third-party bot is "other".
  expect(classifyReplyTarget(999, SELF_ID, SIBLINGS, allPresent)).toBe("other");
  // No reply at all.
  expect(classifyReplyTarget(undefined, SELF_ID, SIBLINGS, allPresent)).toBe(
    "other",
  );
  // No siblings configured (a main bot before any character bot exists): a reply
  // to a human stays "other" (main still answers), own message still "self".
  expect(classifyReplyTarget(100, SELF_ID, [], allPresent)).toBe("other");
  expect(classifyReplyTarget(42, SELF_ID, [], allPresent)).toBe("self");
});

test("classifyReplyTarget: a family sibling that is ABSENT from the chat is 'other'", () => {
  // This is the revert-bug fix. The replied-to character is a known family bot
  // but is not present in this chat (left / removed / down). Routing must fall
  // back to "other" so the main bot answers — deferring to an absent bot that
  // never receives the update is exactly what left the ask unanswered before.
  const SELF_ID = 10;
  const SIBLINGS = ["20", "30"];
  expect(classifyReplyTarget(20, SELF_ID, SIBLINGS, nonePresent)).toBe("other");
  // Selectively present: 20 is present (⇒ sibling), 30 is absent (⇒ other).
  const only20 = (id: string) => id === "20";
  expect(classifyReplyTarget(20, SELF_ID, SIBLINGS, only20)).toBe("sibling");
  expect(classifyReplyTarget(30, SELF_ID, SIBLINGS, only20)).toBe("other");
  // Own message is always "self" regardless of presence (this bot just received
  // the update, so it is trivially present).
  expect(classifyReplyTarget(10, SELF_ID, SIBLINGS, nonePresent)).toBe("self");
});

test("regression: a bare /ask replying to a PRESENT character routes to that character only", () => {
  const MAIN_ID = 10;
  const CHAR_ID = 20;
  const repliedFrom = CHAR_ID; // the replied-to message was sent by the character

  // Main bot's view: the character is a present family sibling → defer.
  const mainReply = classifyReplyTarget(repliedFrom, MAIN_ID, [String(CHAR_ID)], allPresent);
  expect(mainReply).toBe("sibling");
  expect(askGate(bare, false, "supergroup", mainReply)).toBe("skip");

  // Character bot's view: the reply is to its own message → it answers.
  const charReply = classifyReplyTarget(repliedFrom, CHAR_ID, [String(MAIN_ID)], allPresent);
  expect(charReply).toBe("self");
  expect(askGate(bare, true, "supergroup", charReply)).toBe("answer");
});

test("regression: a bare /ask replying to an ABSENT character falls back to the main bot", () => {
  const MAIN_ID = 10;
  const CHAR_ID = 20;
  const repliedFrom = CHAR_ID;

  // The character left the chat (or is down) — it is not present. The main bot
  // must answer rather than defer into silence.
  const mainReply = classifyReplyTarget(repliedFrom, MAIN_ID, [String(CHAR_ID)], nonePresent);
  expect(mainReply).toBe("other");
  expect(askGate(bare, false, "supergroup", mainReply)).toBe("answer");
});
