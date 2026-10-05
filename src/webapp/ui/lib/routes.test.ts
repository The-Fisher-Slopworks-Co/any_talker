// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { t } from "../../../shared/i18n";
import {
  ADMIN_SECTION_IDS,
  adminSectionLabel,
  fromRoute,
  parseRoute,
  showsUsageHeader,
  type Route,
} from "./routes";

const ALL_ROUTES: Route[] = [
  { kind: "main" },
  { kind: "admin" },
  { kind: "admin-section", section: "feedback" },
  { kind: "user-edit", userId: "1", from: "users" },
  { kind: "chat-edit", chatId: "-100", from: "whitelist" },
  {
    kind: "user-edit",
    userId: "1",
    from: { kind: "feedback-view", feedbackId: "f1" },
  },
  {
    kind: "chat-edit",
    chatId: "-100",
    from: { kind: "feedback-view", feedbackId: "f1" },
  },
  { kind: "check-edit", checkId: null },
  { kind: "check-edit", checkId: "c1" },
  { kind: "managed-bot-edit", botId: null },
  { kind: "managed-bot-edit", botId: "b1" },
  { kind: "feedback-view", feedbackId: "f1" },
  { kind: "my-reminders" },
  { kind: "my-facts" },
];

describe("parseRoute", () => {
  // A reload reads the route back from JSON: every screen, with what it was
  // opened from, must come back unchanged so the back button leads the same way.
  test("restores every route after a JSON round trip", () => {
    for (const route of ALL_ROUTES) {
      expect(parseRoute(JSON.parse(JSON.stringify(route)))).toEqual(route);
    }
  });

  test("drops fields a route does not have", () => {
    expect(parseRoute({ kind: "admin", section: "users" })).toEqual({
      kind: "admin",
    });
  });

  test("rejects values this build cannot render", () => {
    const bad: unknown[] = [
      null,
      "main",
      42,
      {},
      { kind: "gone" },
      { kind: "admin-section", section: "nope" },
      { kind: "user-edit", userId: "1" },
      { kind: "user-edit", userId: "", from: "users" },
      { kind: "chat-edit", chatId: 1, from: "chats" },
      { kind: "user-edit", userId: "1", from: { kind: "feedback-view" } },
      {
        kind: "user-edit",
        userId: "1",
        from: { kind: "admin", feedbackId: "f1" },
      },
      { kind: "chat-edit", chatId: "1", from: null },
      { kind: "check-edit" },
      { kind: "managed-bot-edit", botId: 3 },
      { kind: "feedback-view" },
    ];
    for (const raw of bad) {
      expect(parseRoute(raw)).toBeNull();
    }
  });
});

describe("fromRoute", () => {
  test("leads back to the section or the report a page was opened from", () => {
    expect(fromRoute("users")).toEqual({
      kind: "admin-section",
      section: "users",
    });
    const report = { kind: "feedback-view", feedbackId: "f1" } as const;
    expect(fromRoute(report)).toEqual(report);
  });
});

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

describe("adminSectionLabel", () => {
  // The label is both the admin home row and the section's large title, so
  // two sections sharing one would be indistinguishable in either place.
  test("names every section distinctly in both languages", () => {
    for (const lang of ["en", "ru"] as const) {
      const labels = ADMIN_SECTION_IDS.map((id) =>
        adminSectionLabel(t(lang), id),
      );
      expect(labels.every((l) => l.length > 0)).toBe(true);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });

  test("calls the spend screen Spending", () => {
    expect(adminSectionLabel(t("en"), "spend")).toBe("Spending");
  });
});
