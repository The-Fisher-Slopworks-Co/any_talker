// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { afterAll, describe, expect, test } from "bun:test";
import type { Route } from "../lib/routes";
import { routeLoads } from "./route-loads";

const keys = (route: Route) => routeLoads(route).map((l) => l.key);

describe("routeLoads", () => {
  const saved = new Map<string, string>();
  const previous = globalThis.window;
  Object.assign(globalThis, {
    window: {
      ...previous,
      sessionStorage: {
        getItem: (k: string) => saved.get(k) ?? null,
        setItem: (k: string, v: string) => saved.set(k, v),
      },
    },
  });
  afterAll(() => Object.assign(globalThis, { window: previous }));

  test("the home needs nothing beyond what the app starts with", () => {
    expect(keys({ kind: "main" })).toEqual([]);
  });

  test("a user page waits for every part of its first frame", () => {
    expect(
      keys({ kind: "user-edit", userId: "42", from: "users" }).sort(),
    ).toEqual(
      [
        "admin-user:42",
        "user-spending:42",
        "user-usage:42",
        "my-bots",
        "user-facts:42:main",
      ].sort(),
    );
  });

  test("a picked scope or filter is the one preloaded", () => {
    saved.set("any-talker:facts-scope", JSON.stringify("bot-7"));
    saved.set("any-talker:user-facts-scope:42", JSON.stringify("bot-7"));
    saved.set("any-talker:feedback-filter", JSON.stringify("new"));
    expect(keys({ kind: "my-facts" })).toContain("my-facts:bot-7");
    expect(keys({ kind: "user-edit", userId: "42", from: "users" })).toContain(
      "user-facts:42:bot-7",
    );
    expect(keys({ kind: "admin-section", section: "feedback" })).toEqual([
      "feedback:new",
    ]);
  });

  test("a settings section waits for the settings and its own lists", () => {
    expect(keys({ kind: "admin-section", section: "whitelist" })).toEqual([
      "admin-settings",
      "admin-whitelist",
      "admin-blacklist",
    ]);
  });

  test("a new bot or check has nothing of its own to fetch", () => {
    expect(keys({ kind: "managed-bot-edit", botId: null })).toEqual([
      "managed-bot-new",
    ]);
    expect(keys({ kind: "check-edit", checkId: null })).toEqual(["check:new"]);
  });
});
