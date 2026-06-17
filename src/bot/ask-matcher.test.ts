// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect } from "bun:test";
import {
  matchAsk,
  askGate,
  computeAlone,
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

const bare: AskMatch = { detailLevel: "short", userText: "", explicit: false };
const explicit: AskMatch = { detailLevel: "short", userText: "", explicit: true };

test("askGate: an explicit @self mention is always answered", () => {
  expect(askGate(explicit, true, "group")).toBe("answer");
  expect(askGate(explicit, true, "private")).toBe("answer");
  expect(askGate(explicit, false, "supergroup")).toBe("answer");
});

test("askGate: the main bot answers a bare /ask everywhere", () => {
  expect(askGate(bare, false, "group")).toBe("answer");
  expect(askGate(bare, false, "private")).toBe("answer");
});

test("askGate: a managed bot answers a bare /ask in its DM, checks alone in a group", () => {
  expect(askGate(bare, true, "private")).toBe("answer");
  expect(askGate(bare, true, "group")).toBe("check-alone");
  expect(askGate(bare, true, "supergroup")).toBe("check-alone");
  expect(askGate(bare, true, undefined)).toBe("check-alone");
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
