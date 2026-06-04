// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect } from "bun:test";
import { matchAsk } from "./index";

const SELF = "MainBot";

test("main bot (requireMention=false) answers bare /ask and /ask@self, not @other", () => {
  expect(matchAsk("/ask hello", SELF, false)?.userText).toBe("hello");
  expect(matchAsk("/ask@MainBot hello", SELF, false)?.userText).toBe("hello");
  // case-insensitive self-mention
  expect(matchAsk("/ask@mainbot hello", SELF, false)?.userText).toBe("hello");
  expect(matchAsk("/askwise foo", SELF, false)?.detailLevel).toBe("wise");
  // A caption addressed to a DIFFERENT bot must NOT be answered by the main bot
  // (this is the cross-bot caption leak fix).
  expect(matchAsk("/ask@CatBot hello", SELF, false)).toBeNull();
});

test("managed bot (requireMention=true) answers only /ask@self", () => {
  const CAT = "CatBot";
  expect(matchAsk("/ask@CatBot feed me", CAT, true)?.userText).toBe("feed me");
  expect(matchAsk("/ask@catbot feed me", CAT, true)?.userText).toBe("feed me");
  expect(matchAsk("/askwise@CatBot ponder", CAT, true)?.detailLevel).toBe("wise");
  // Bare /ask belongs to the main bot — the cat must not answer it.
  expect(matchAsk("/ask feed me", CAT, true)).toBeNull();
  // A command aimed at a different bot is not ours.
  expect(matchAsk("/ask@OtherBot feed me", CAT, true)).toBeNull();
  // A username that merely starts with the same prefix must not match.
  expect(matchAsk("/ask@CatBotBackup feed me", CAT, true)).toBeNull();
});

test("non-ask text never matches", () => {
  expect(matchAsk("hello there", SELF, false)).toBeNull();
  expect(matchAsk("/start", SELF, false)).toBeNull();
});
