// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, spyOn } from "bun:test";
import { loadConfig } from "./config";

const baseEnv = {
  BOT_TOKEN: "tok",
  OPENROUTER_API_KEY: "sk-test",
  OPENROUTER_BASE_URL: "https://api.example.com/v1",
  BOT_OWNER_ID: "12345",
};

test("loadConfig returns required fields when all env vars present", () => {
  const cfg = loadConfig({ ...baseEnv });
  expect(cfg.botToken).toBe("tok");
  expect(cfg.openrouterApiKey).toBe("sk-test");
  expect(cfg.openrouterBaseUrl).toBe("https://api.example.com/v1");
  expect(cfg.botOwnerId).toBe("12345");
  expect(cfg.keydbUrl).toBe("redis://localhost:6379");
  expect(cfg.port).toBe(8080);
  expect(cfg.logFormat).toBe("pretty");
  expect(cfg.logIncomingUpdates).toBe(true);
  expect(cfg.logDebug).toBe(false);
});

test("loadConfig reads optional app attribution", () => {
  const bare = loadConfig({ ...baseEnv });
  expect(bare.openrouterAppUrl).toBeUndefined();
  expect(bare.openrouterAppTitle).toBeUndefined();

  const cfg = loadConfig({
    ...baseEnv,
    OPENROUTER_APP_URL: "https://example.com",
    OPENROUTER_APP_TITLE: "any_talker",
    });
  expect(cfg.openrouterAppUrl).toBe("https://example.com");
  expect(cfg.openrouterAppTitle).toBe("any_talker");
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

test("loadConfig throws on missing OPENROUTER_API_KEY", () => {
  expect(() =>
    loadConfig({
      BOT_TOKEN: "tok",
      OPENROUTER_BASE_URL: "https://api.example.com/v1",
      BOT_OWNER_ID: "1",
    } as Record<string, string>),
  ).toThrow(/OPENROUTER_API_KEY/);
});

// The bot only talks to OpenRouter now, so the base URL has exactly one right
// answer and naming it is reserved for a proxy in front of it.
test("loadConfig defaults the base URL to OpenRouter", () => {
  const cfg = loadConfig({
    BOT_TOKEN: "tok",
    OPENROUTER_API_KEY: "sk-test",
    BOT_OWNER_ID: "1",
  } as Record<string, string>);
  expect(cfg.openrouterBaseUrl).toBe("https://openrouter.ai/api/v1");
});

// One release of grace: an existing deployment keeps booting on the old names
// instead of dying at startup, and is told to rename them.
test("loadConfig falls back to the legacy OPENAI_* names", () => {
  const warn = spyOn(console, "warn").mockImplementation(() => {});
  try {
    const cfg = loadConfig({
      BOT_TOKEN: "tok",
      OPENAI_API_KEY: "sk-legacy",
      OPENAI_BASE_URL: "https://gw.internal/v1",
      BOT_OWNER_ID: "1",
    } as Record<string, string>);
    expect(cfg.openrouterApiKey).toBe("sk-legacy");
    expect(cfg.openrouterBaseUrl).toBe("https://gw.internal/v1");
    expect(warn).toHaveBeenCalled();
  } finally {
    warn.mockRestore();
  }
});

// The new names win, and no deprecation warning is emitted for them.
test("loadConfig prefers the OPENROUTER_* names over the legacy ones", () => {
  const warn = spyOn(console, "warn").mockImplementation(() => {});
  try {
    const cfg = loadConfig({
      ...baseEnv,
      OPENAI_API_KEY: "sk-legacy",
      OPENAI_BASE_URL: "https://gw.internal/v1",
    });
    expect(cfg.openrouterApiKey).toBe("sk-test");
    expect(cfg.openrouterBaseUrl).toBe("https://api.example.com/v1");
    expect(warn).not.toHaveBeenCalled();
  } finally {
    warn.mockRestore();
  }
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
