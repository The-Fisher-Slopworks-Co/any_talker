// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import {
  resolveTelegramEnv,
  telegramApiUrl,
  telegramFileUrl,
} from "./telegram-env";

describe("telegramApiUrl", () => {
  test("addresses the production root by default", () => {
    expect(telegramApiUrl("123:ABC", "getFile", "prod")).toBe(
      "https://api.telegram.org/bot123:ABC/getFile",
    );
  });

  test("inserts the test segment after the token", () => {
    expect(telegramApiUrl("123:ABC", "getFile", "test")).toBe(
      "https://api.telegram.org/bot123:ABC/test/getFile",
    );
  });
});

describe("telegramFileUrl", () => {
  test("addresses the production download root", () => {
    expect(telegramFileUrl("123:ABC", "photos/f.jpg", "prod")).toBe(
      "https://api.telegram.org/file/bot123:ABC/photos/f.jpg",
    );
  });

  test("inserts the test segment after the token", () => {
    expect(telegramFileUrl("123:ABC", "photos/f.jpg", "test")).toBe(
      "https://api.telegram.org/file/bot123:ABC/test/photos/f.jpg",
    );
  });
});

describe("resolveTelegramEnv", () => {
  test("defaults to prod when unset", () => {
    expect(resolveTelegramEnv({})).toBe("prod");
  });

  test("honours an explicit value", () => {
    expect(resolveTelegramEnv({ TELEGRAM_ENV: "test" })).toBe("test");
    expect(resolveTelegramEnv({ TELEGRAM_ENV: "prod" })).toBe("prod");
  });

  test("rejects anything else, including an empty value", () => {
    expect(() => resolveTelegramEnv({ TELEGRAM_ENV: "staging" })).toThrow(
      /TELEGRAM_ENV/,
    );
    expect(() => resolveTelegramEnv({ TELEGRAM_ENV: "" })).toThrow(
      /TELEGRAM_ENV/,
    );
  });
});
