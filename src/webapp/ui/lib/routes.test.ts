// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { showsUsageHeader, type Route } from "./routes";

describe("showsUsageHeader", () => {
  test("shows the usage header on the settings home", () => {
    expect(showsUsageHeader({ kind: "main" })).toBe(true);
  });

  test("hides it on every other screen", () => {
    const others: Route[] = [
      { kind: "admin" },
      { kind: "admin-section", section: "prompt" },
      { kind: "admin-section", section: "ratelimit" },
      { kind: "user-edit", userId: "1", from: "users" },
      { kind: "chat-edit", chatId: "1", from: "chats" },
      { kind: "check-edit", checkId: null },
      { kind: "managed-bot-edit", botId: null },
      { kind: "feedback-view", feedbackId: "1" },
      { kind: "my-reminders" },
      { kind: "my-facts" },
    ];
    for (const route of others) {
      expect(showsUsageHeader(route)).toBe(false);
    }
  });
});
