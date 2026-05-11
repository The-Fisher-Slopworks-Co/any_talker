// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "./storage/memory";
import {
  getOrInitSettings,
  applyChatOverrides,
  getEffectiveSettings,
} from "./settings";
import { DEFAULT_SETTINGS } from "./shared/types";

describe("getOrInitSettings", () => {
  test("returns defaults and persists them on first call", async () => {
    const storage = new MemoryStorage();
    const s = await getOrInitSettings(storage);
    expect(s).toEqual(DEFAULT_SETTINGS);
    expect(await storage.getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  test("returns existing settings", async () => {
    const storage = new MemoryStorage();
    const custom = {
      ...DEFAULT_SETTINGS,
      systemPrompt: "custom",
      model: "openai/gpt-4o-mini",
    };
    await storage.saveSettings(custom);
    expect(await getOrInitSettings(storage)).toEqual(custom);
  });
});

describe("applyChatOverrides", () => {
  test("returns global unchanged when chat is null", () => {
    expect(applyChatOverrides(DEFAULT_SETTINGS, null)).toBe(DEFAULT_SETTINGS);
  });

  test("overrides only specified fields", () => {
    const r = applyChatOverrides(DEFAULT_SETTINGS, {
      systemPrompt: "chat",
    });
    expect(r.systemPrompt).toBe("chat");
    expect(r.models).toBe(DEFAULT_SETTINGS.models);
    expect(r.rateLimit).toBe(DEFAULT_SETTINGS.rateLimit);
  });

  test("overrides every field when all set", () => {
    const r = applyChatOverrides(DEFAULT_SETTINGS, {
      systemPrompt: "p",
      models: ["x"],
      rateLimit: {
        capacity: 1,
        refillAmount: 1,
        refillIntervalMs: 1000,
        ownerExempt: false,
      },
    });
    expect(r).toEqual({
      systemPrompt: "p",
      models: ["x"],
      rateLimit: {
        capacity: 1,
        refillAmount: 1,
        refillIntervalMs: 1000,
        ownerExempt: false,
      },
      timezone: DEFAULT_SETTINGS.timezone,
      providerSort: DEFAULT_SETTINGS.providerSort,
    });
  });

  test("provider sort: chat null overrides global value", () => {
    const global = { ...DEFAULT_SETTINGS, providerSort: "throughput" as const };
    const r = applyChatOverrides(global, { providerSort: null });
    expect(r.providerSort).toBeNull();
  });

  test("provider sort: chat undefined inherits global value", () => {
    const global = { ...DEFAULT_SETTINGS, providerSort: "price" as const };
    const r = applyChatOverrides(global, { systemPrompt: "x" });
    expect(r.providerSort).toBe("price");
  });

  test("provider sort: chat string overrides global", () => {
    const r = applyChatOverrides(DEFAULT_SETTINGS, { providerSort: "latency" });
    expect(r.providerSort).toBe("latency");
  });
});

describe("getEffectiveSettings", () => {
  test("returns global when no chat overrides", async () => {
    const storage = new MemoryStorage();
    expect(await getEffectiveSettings(storage, "c1")).toEqual(DEFAULT_SETTINGS);
  });

  test("merges in chat overrides", async () => {
    const storage = new MemoryStorage();
    await storage.saveChatSettings("c1", { systemPrompt: "chat" });
    const r = await getEffectiveSettings(storage, "c1");
    expect(r.systemPrompt).toBe("chat");
    expect(r.models).toEqual(DEFAULT_SETTINGS.models);
  });
});
