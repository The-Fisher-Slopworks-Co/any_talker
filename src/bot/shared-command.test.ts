// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect } from "bun:test";
import { handlesSharedCommand } from "./shared-command";
import { BOT_PRESENCE_TTL_MS } from "./routing";

const NOW = 10 * BOT_PRESENCE_TTL_MS;

// A bare `/feedback` in a group, seen from the bot `self`.
const gate = (
  self: string,
  siblings: readonly string[],
  presence: Record<string, number> | null,
  over: { explicit?: boolean; chatType?: string | undefined } = {},
): boolean =>
  handlesSharedCommand({
    explicit: over.explicit ?? false,
    chatType: "chatType" in over ? over.chatType : "supergroup",
    selfBotId: self,
    siblingBotIds: siblings,
    presence,
    nowMs: NOW,
  });

test("the smallest id present in the chat acts on a bare shared command", () => {
  const present = { "100": NOW, "300": NOW };
  expect(gate("100", ["300"], present)).toBe(true);
  expect(gate("300", ["100"], present)).toBe(false);
});

test("ids are compared as numbers, not as strings", () => {
  // Lexicographically "10000" < "9999"; numerically it is the other way round,
  // and it is the numeric order the group menu uses.
  const present = { "9999": NOW, "10000": NOW };
  expect(gate("9999", ["10000"], present)).toBe(true);
  expect(gate("10000", ["9999"], present)).toBe(false);
});

test("a sibling that is not in this chat does not silence this bot", () => {
  // The family-wide owner of the shared commands is somewhere else: the
  // smallest id that IS here has to take the report.
  expect(gate("300", ["100"], {})).toBe(true);
  expect(gate("300", ["100"], { "999": NOW })).toBe(true);
});

test("a stale presence record reads as absent", () => {
  const stale = NOW - BOT_PRESENCE_TTL_MS - 1;
  expect(gate("300", ["100"], { "100": stale })).toBe(true);
  // Exactly at the TTL boundary the sibling still counts as present.
  const edge = NOW - BOT_PRESENCE_TTL_MS;
  expect(gate("300", ["100"], { "100": edge })).toBe(false);
});

test("an unreadable presence map fails open: the report is never dropped", () => {
  expect(gate("300", ["100"], null)).toBe(true);
});

test("an explicit @self mention is always acted on", () => {
  // `/feedback@self` reached this bot alone — the smaller sibling never matched
  // it, so deferring would drop the report.
  expect(gate("300", ["100"], { "100": NOW }, { explicit: true })).toBe(true);
});

test("a DM is always acted on: one bot, nothing to duplicate", () => {
  expect(gate("300", ["100"], { "100": NOW }, { chatType: "private" })).toBe(
    true,
  );
});

test("a lone bot acts on its own", () => {
  expect(gate("300", [], {})).toBe(true);
  expect(gate("300", [], null, { chatType: undefined })).toBe(true);
});

test("regression: two family bots in one group file exactly one report", () => {
  // The bug: a bare `/feedback broke` is delivered to every bot in the chat and
  // each one matched it, so the same report was filed once per bot.
  const MAIN = "500";
  const CHARACTER = "900";
  const present = { [MAIN]: NOW, [CHARACTER]: NOW };
  const acting = [
    gate(MAIN, [CHARACTER], present),
    gate(CHARACTER, [MAIN], present),
  ].filter(Boolean);
  expect(acting).toHaveLength(1);
});
