// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { newBotLink, revertFailed } from "./managed-bot-form";

const confirmed = { displayName: "Nemo", systemPrompt: "Calm." };

describe("revertFailed", () => {
  test("takes back only the field the refused save changed", () => {
    const failed = { displayName: "", systemPrompt: "Calm." };
    const form = { displayName: "", systemPrompt: "Calm. Brief." };
    expect(revertFailed(form, failed, confirmed)).toEqual({
      displayName: "Nemo",
      systemPrompt: "Calm. Brief.",
    });
  });

  test("keeps what was typed since the refused save", () => {
    const failed = { displayName: "Kitty", systemPrompt: "Calm." };
    const form = { displayName: "Kitty Cat", systemPrompt: "Calm." };
    expect(revertFailed(form, failed, confirmed)).toEqual(form);
  });
});

describe("newBotLink", () => {
  test("is the manager's link alone when nothing is suggested", () => {
    expect(newBotLink("main_bot", " ", "")).toBe(
      "https://t.me/newbot/main_bot",
    );
  });

  test("carries the trimmed username in the path and the name in the query", () => {
    expect(newBotLink("main_bot", " nemo_bot ", "Captain Nemo")).toBe(
      "https://t.me/newbot/main_bot/nemo_bot?name=Captain%20Nemo",
    );
  });
});
