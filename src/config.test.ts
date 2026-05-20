// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect } from "bun:test";
import { loadConfig } from "./config";

test("loadConfig returns required fields when all env vars present", () => {
  const cfg = loadConfig({
    BOT_TOKEN: "tok",
    OPENROUTER_API_KEY: "or",
    BOT_OWNER_ID: "12345",
  });
  expect(cfg.botToken).toBe("tok");
  expect(cfg.openrouterApiKey).toBe("or");
  expect(cfg.botOwnerId).toBe("12345");
  expect(cfg.keydbUrl).toBe("redis://localhost:6379");
  expect(cfg.port).toBe(8080);
  expect(cfg.logFormat).toBe("pretty");
  expect(cfg.logIncomingUpdates).toBe(true);
  expect(cfg.logDebug).toBe(false);
});

test("loadConfig honours LOG_FORMAT, LOG_INCOMING_UPDATES and LOG_DEBUG", () => {
  const cfg = loadConfig({
    BOT_TOKEN: "tok",
    OPENROUTER_API_KEY: "or",
    BOT_OWNER_ID: "1",
    LOG_FORMAT: "json",
    LOG_INCOMING_UPDATES: "false",
    LOG_DEBUG: "true",
  });
  expect(cfg.logFormat).toBe("json");
  expect(cfg.logIncomingUpdates).toBe(false);
  expect(cfg.logDebug).toBe(true);
});

test("loadConfig defaults logFormat to json when NODE_ENV=production", () => {
  const cfg = loadConfig({
    BOT_TOKEN: "tok",
    OPENROUTER_API_KEY: "or",
    BOT_OWNER_ID: "1",
    NODE_ENV: "production",
  });
  expect(cfg.logFormat).toBe("json");
});

test("loadConfig rejects unparseable LOG_INCOMING_UPDATES", () => {
  expect(() =>
    loadConfig({
      BOT_TOKEN: "tok",
      OPENROUTER_API_KEY: "or",
      BOT_OWNER_ID: "1",
      LOG_INCOMING_UPDATES: "maybe",
    }),
  ).toThrow(/LOG_INCOMING_UPDATES/);
});

test("loadConfig throws on missing required field", () => {
  expect(() =>
    loadConfig({ BOT_TOKEN: "tok" } as Record<string, string>),
  ).toThrow(/OPENROUTER_API_KEY/);
});

test("loadConfig parses optional overrides", () => {
  const cfg = loadConfig({
    BOT_TOKEN: "tok",
    OPENROUTER_API_KEY: "or",
    BOT_OWNER_ID: "1",
    KEYDB_URL: "redis://other:6379",
    PORT: "4000",
  });
  expect(cfg.keydbUrl).toBe("redis://other:6379");
  expect(cfg.port).toBe(4000);
});

test("loadConfig OpenRouter app attribution defaults to undefined", () => {
  const cfg = loadConfig({
    BOT_TOKEN: "tok",
    OPENROUTER_API_KEY: "or",
    BOT_OWNER_ID: "1",
  });
  expect(cfg.openrouterAppUrl).toBeUndefined();
  expect(cfg.openrouterAppTitle).toBeUndefined();
});

test("loadConfig reads OPENROUTER_APP_URL and OPENROUTER_APP_TITLE", () => {
  const cfg = loadConfig({
    BOT_TOKEN: "tok",
    OPENROUTER_API_KEY: "or",
    BOT_OWNER_ID: "1",
    OPENROUTER_APP_URL: "https://example.com/any_talker",
    OPENROUTER_APP_TITLE: "any_talker",
  });
  expect(cfg.openrouterAppUrl).toBe("https://example.com/any_talker");
  expect(cfg.openrouterAppTitle).toBe("any_talker");
});

test("loadConfig treats empty OPENROUTER_APP_* as undefined", () => {
  const cfg = loadConfig({
    BOT_TOKEN: "tok",
    OPENROUTER_API_KEY: "or",
    BOT_OWNER_ID: "1",
    OPENROUTER_APP_URL: "",
    OPENROUTER_APP_TITLE: "",
  });
  expect(cfg.openrouterAppUrl).toBeUndefined();
  expect(cfg.openrouterAppTitle).toBeUndefined();
});
