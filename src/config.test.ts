// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect } from "bun:test";
import { loadConfig } from "./config";

const baseEnv = {
  BOT_TOKEN: "tok",
  OPENAI_API_KEY: "sk-test",
  OPENAI_BASE_URL: "https://api.example.com/v1",
  BOT_OWNER_ID: "12345",
};

test("loadConfig returns required fields when all env vars present", () => {
  const cfg = loadConfig({ ...baseEnv });
  expect(cfg.botToken).toBe("tok");
  expect(cfg.openaiApiKey).toBe("sk-test");
  expect(cfg.openaiBaseUrl).toBe("https://api.example.com/v1");
  expect(cfg.botOwnerId).toBe("12345");
  expect(cfg.keydbUrl).toBe("redis://localhost:6379");
  expect(cfg.port).toBe(8080);
  expect(cfg.logFormat).toBe("pretty");
  expect(cfg.logIncomingUpdates).toBe(true);
  expect(cfg.logDebug).toBe(false);
});

test("loadConfig honours LOG_FORMAT, LOG_INCOMING_UPDATES and LOG_DEBUG", () => {
  const cfg = loadConfig({
    ...baseEnv,
    LOG_FORMAT: "json",
    LOG_INCOMING_UPDATES: "false",
    LOG_DEBUG: "true",
  });
  expect(cfg.logFormat).toBe("json");
  expect(cfg.logIncomingUpdates).toBe(false);
  expect(cfg.logDebug).toBe(true);
});

test("loadConfig defaults logFormat to json when NODE_ENV=production", () => {
  const cfg = loadConfig({ ...baseEnv, NODE_ENV: "production" });
  expect(cfg.logFormat).toBe("json");
});

test("loadConfig rejects unparseable LOG_INCOMING_UPDATES", () => {
  expect(() =>
    loadConfig({ ...baseEnv, LOG_INCOMING_UPDATES: "maybe" }),
  ).toThrow(/LOG_INCOMING_UPDATES/);
});

test("loadConfig throws on missing OPENAI_API_KEY", () => {
  expect(() =>
    loadConfig({
      BOT_TOKEN: "tok",
      OPENAI_BASE_URL: "https://api.example.com/v1",
      BOT_OWNER_ID: "1",
    } as Record<string, string>),
  ).toThrow(/OPENAI_API_KEY/);
});

test("loadConfig throws on missing OPENAI_BASE_URL", () => {
  expect(() =>
    loadConfig({
      BOT_TOKEN: "tok",
      OPENAI_API_KEY: "sk-test",
      BOT_OWNER_ID: "1",
    } as Record<string, string>),
  ).toThrow(/OPENAI_BASE_URL/);
});

test("loadConfig parses optional overrides", () => {
  const cfg = loadConfig({
    ...baseEnv,
    KEYDB_URL: "redis://other:6379",
    PORT: "4000",
  });
  expect(cfg.keydbUrl).toBe("redis://other:6379");
  expect(cfg.port).toBe(4000);
});
