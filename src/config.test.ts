// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect } from "bun:test";
import { loadConfig } from "./config";

test("loadConfig returns required fields when all env vars present", () => {
  const cfg = loadConfig({
    BOT_TOKEN: "tok",
    OPENROUTER_API_KEY: "or",
    BOT_OWNER_ID: "12345",
    WEBAPP_URL: "https://example.com/app",
  });
  expect(cfg.botToken).toBe("tok");
  expect(cfg.openrouterApiKey).toBe("or");
  expect(cfg.botOwnerId).toBe("12345");
  expect(cfg.webappUrl).toBe("https://example.com/app");
  expect(cfg.keydbUrl).toBe("redis://localhost:6379");
  expect(cfg.port).toBe(8080);
  expect(cfg.webhookUrl).toBeUndefined();
  expect(cfg.logFormat).toBe("pretty");
  expect(cfg.logIncomingUpdates).toBe(true);
});

test("loadConfig honours LOG_FORMAT and LOG_INCOMING_UPDATES", () => {
  const cfg = loadConfig({
    BOT_TOKEN: "tok",
    OPENROUTER_API_KEY: "or",
    BOT_OWNER_ID: "1",
    WEBAPP_URL: "https://example.com",
    LOG_FORMAT: "json",
    LOG_INCOMING_UPDATES: "false",
  });
  expect(cfg.logFormat).toBe("json");
  expect(cfg.logIncomingUpdates).toBe(false);
});

test("loadConfig defaults logFormat to json when NODE_ENV=production", () => {
  const cfg = loadConfig({
    BOT_TOKEN: "tok",
    OPENROUTER_API_KEY: "or",
    BOT_OWNER_ID: "1",
    WEBAPP_URL: "https://example.com",
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
      WEBAPP_URL: "https://example.com",
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
    WEBAPP_URL: "https://example.com",
    WEBHOOK_URL: "https://example.com/hook",
    KEYDB_URL: "redis://other:6379",
    PORT: "4000",
  });
  expect(cfg.webhookUrl).toBe("https://example.com/hook");
  expect(cfg.keydbUrl).toBe("redis://other:6379");
  expect(cfg.port).toBe(4000);
});
