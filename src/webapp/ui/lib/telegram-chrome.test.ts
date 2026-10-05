// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { matchTelegramChrome } from "./telegram-chrome";

describe("matchTelegramChrome", () => {
  test("paints the header and the webview with the page's background", () => {
    const calls: string[] = [];
    matchTelegramChrome({
      setHeaderColor: (c) => calls.push(`header:${c}`),
      setBackgroundColor: (c) => calls.push(`bg:${c}`),
    });
    expect(calls).toEqual([
      "header:secondary_bg_color",
      "bg:secondary_bg_color",
    ]);
  });

  test("does nothing outside Telegram or on a client without the methods", () => {
    expect(() => matchTelegramChrome(undefined)).not.toThrow();
    expect(() => matchTelegramChrome({})).not.toThrow();
  });
});
