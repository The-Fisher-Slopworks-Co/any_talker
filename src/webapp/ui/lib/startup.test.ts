// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import type { MeResponse } from "../api-client";
import { settleStartup, startupLang } from "./startup";

const me = (language: MeResponse["language"]): MeResponse => ({
  isOwner: false,
  displayName: null,
  timezone: null,
  gender: null,
  language,
  dateFormat: null,
});

describe("settleStartup", () => {
  test("a loaded /me becomes ready", async () => {
    const m = me("ru");
    expect(await settleStartup(Promise.resolve(m))).toEqual({
      kind: "ready",
      me: m,
    });
  });

  test("a failed /me becomes failed instead of rejecting", async () => {
    expect(await settleStartup(Promise.reject(new Error("500")))).toEqual({
      kind: "failed",
    });
  });
});

describe("startupLang", () => {
  test("the saved language wins over Telegram's", () => {
    expect(startupLang({ kind: "ready", me: me("ru") }, "en")).toBe("ru");
  });

  test("no saved language falls back to Telegram's", () => {
    expect(startupLang({ kind: "ready", me: me(null) }, "ru-RU")).toBe("ru");
  });

  test("a failed /me falls back to Telegram's, then English", () => {
    expect(startupLang({ kind: "failed" }, "ru")).toBe("ru");
    expect(startupLang({ kind: "failed" }, undefined)).toBe("en");
  });
});
