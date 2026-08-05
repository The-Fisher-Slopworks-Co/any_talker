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

test("loadConfig infers the provider flavor from the base URL", () => {
  expect(loadConfig({ ...baseEnv }).aiProviderFlavor).toBe("generic");
  expect(
    loadConfig({ ...baseEnv, OPENAI_BASE_URL: "https://openrouter.ai/api/v1" })
      .aiProviderFlavor,
  ).toBe("openrouter");
});

test("AI_PROVIDER_FLAVOR overrides the inferred flavor", () => {
  // A gateway that fronts OpenRouter has its own hostname, so the override is
  // the only way to declare the surface it really speaks.
  const cfg = loadConfig({
    ...baseEnv,
    OPENAI_BASE_URL: "https://gw.internal/v1",
    AI_PROVIDER_FLAVOR: "openrouter",
  });
  expect(cfg.aiProviderFlavor).toBe("openrouter");
});

test("AI_PROVIDER_FLAVOR=auto falls back to inference", () => {
  const cfg = loadConfig({
    ...baseEnv,
    OPENAI_BASE_URL: "https://openrouter.ai/api/v1",
    AI_PROVIDER_FLAVOR: "auto",
  });
  expect(cfg.aiProviderFlavor).toBe("openrouter");
});

// Failing loudly at boot beats silently mis-declaring the surface: a wrong
// profile makes every request fail with HTTP 400, or silently drops routing.
test("loadConfig rejects an unknown AI_PROVIDER_FLAVOR", () => {
  expect(() =>
    loadConfig({ ...baseEnv, AI_PROVIDER_FLAVOR: "openai" }),
  ).toThrow(/AI_PROVIDER_FLAVOR/);
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
