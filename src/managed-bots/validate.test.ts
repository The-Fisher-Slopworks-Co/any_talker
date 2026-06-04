// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect } from "bun:test";
import { normalizeManagedBotInput } from "./validate";

test("trims the display name and passes the prompt through", () => {
  expect(
    normalizeManagedBotInput({ displayName: "  Kitty  ", systemPrompt: "be a cat" }),
  ).toEqual({ ok: true, value: { displayName: "Kitty", systemPrompt: "be a cat" } });
});

test("rejects an empty / whitespace display name", () => {
  expect(normalizeManagedBotInput({ displayName: "   ", systemPrompt: "x" })).toEqual({
    ok: false,
    error: "display_name_required",
  });
});

test("rejects an over-long display name", () => {
  expect(
    normalizeManagedBotInput({ displayName: "x".repeat(65), systemPrompt: "" }),
  ).toEqual({ ok: false, error: "display_name_too_long" });
});

test("rejects an over-long system prompt", () => {
  expect(
    normalizeManagedBotInput({ displayName: "ok", systemPrompt: "x".repeat(8001) }),
  ).toEqual({ ok: false, error: "system_prompt_too_long" });
});

test("defaults a missing system prompt to empty", () => {
  expect(normalizeManagedBotInput({ displayName: "ok" })).toEqual({
    ok: true,
    value: { displayName: "ok", systemPrompt: "" },
  });
});
