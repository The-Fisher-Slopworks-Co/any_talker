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
      models: ["openai/gpt-4o-mini"],
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
    });
    expect(r).toEqual({
      systemPrompt: "p",
      models: ["x"],
      // Rate limit is per-user and global — chat settings never override it.
      rateLimit: DEFAULT_SETTINGS.rateLimit,
      timezone: DEFAULT_SETTINGS.timezone,
      expandableBlockquoteThreshold:
        DEFAULT_SETTINGS.expandableBlockquoteThreshold,
      // Reminder cap is global policy too — never overridden per chat.
      maxRemindersPerUser: DEFAULT_SETTINGS.maxRemindersPerUser,
    });
  });

  test("chat settings never override the global rate limit", () => {
    const global = {
      ...DEFAULT_SETTINGS,
      rateLimit: { ...DEFAULT_SETTINGS.rateLimit, fiveHourTokens: 12345 },
    };
    const r = applyChatOverrides(global, { systemPrompt: "x" });
    expect(r.rateLimit).toBe(global.rateLimit);
  });

  test("normalize fills default expandableBlockquoteThreshold when missing", async () => {
    const storage = new MemoryStorage();
    const legacy = {
      ...DEFAULT_SETTINGS,
      expandableBlockquoteThreshold: undefined,
    } as never;
    await storage.saveSettings(legacy);
    const s = await getOrInitSettings(storage);
    expect(s.expandableBlockquoteThreshold).toBe(
      DEFAULT_SETTINGS.expandableBlockquoteThreshold,
    );
  });

  test("normalize rejects negative stored expandableBlockquoteThreshold", async () => {
    const storage = new MemoryStorage();
    await storage.saveSettings({
      ...DEFAULT_SETTINGS,
      expandableBlockquoteThreshold: -50,
    });
    const s = await getOrInitSettings(storage);
    expect(s.expandableBlockquoteThreshold).toBe(
      DEFAULT_SETTINGS.expandableBlockquoteThreshold,
    );
  });

  test("normalize fills default maxRemindersPerUser when missing", async () => {
    const storage = new MemoryStorage();
    const legacy = {
      ...DEFAULT_SETTINGS,
      maxRemindersPerUser: undefined,
    } as never;
    await storage.saveSettings(legacy);
    const s = await getOrInitSettings(storage);
    expect(s.maxRemindersPerUser).toBe(DEFAULT_SETTINGS.maxRemindersPerUser);
  });

  test("normalize rejects non-positive stored maxRemindersPerUser", async () => {
    const storage = new MemoryStorage();
    await storage.saveSettings({ ...DEFAULT_SETTINGS, maxRemindersPerUser: 0 });
    const s = await getOrInitSettings(storage);
    expect(s.maxRemindersPerUser).toBe(DEFAULT_SETTINGS.maxRemindersPerUser);
  });

  test("normalize floors a fractional maxRemindersPerUser", async () => {
    const storage = new MemoryStorage();
    await storage.saveSettings({
      ...DEFAULT_SETTINGS,
      maxRemindersPerUser: 7.9,
    });
    const s = await getOrInitSettings(storage);
    expect(s.maxRemindersPerUser).toBe(7);
  });

  test("normalize drops legacy OpenRouter-era fields on read", async () => {
    const storage = new MemoryStorage();
    await storage.saveSettings({
      ...DEFAULT_SETTINGS,
      providerSort: "throughput",
      provider: "deepinfra/fp4",
      serviceTier: "flex",
    } as never);
    const s = (await getOrInitSettings(storage)) as Record<string, unknown>;
    expect(s.providerSort).toBeUndefined();
    expect(s.provider).toBeUndefined();
    expect(s.serviceTier).toBeUndefined();
  });

  test("normalize backfills the dual-window config from a legacy token-bucket shape", async () => {
    const storage = new MemoryStorage();
    const legacy = {
      ...DEFAULT_SETTINGS,
      rateLimit: {
        capacity: 12345,
        refillAmount: 1,
        refillIntervalMs: 1000,
        ownerExempt: false,
      } as never,
    };
    await storage.saveSettings(legacy);
    const s = await getOrInitSettings(storage);
    // Legacy burst capacity maps to the 5-hour budget; the rest defaults in.
    expect(s.rateLimit.fiveHourTokens).toBe(12345);
    expect(s.rateLimit.weeklyTokens).toBe(
      DEFAULT_SETTINGS.rateLimit.weeklyTokens,
    );
    expect(s.rateLimit.ownerExempt).toBe(false);
    expect(s.rateLimit.wiseMultiplier).toBe(
      DEFAULT_SETTINGS.rateLimit.wiseMultiplier,
    );
  });

  test("chat timezone null overrides the global value", () => {
    const global = { ...DEFAULT_SETTINGS, timezone: "Europe/Moscow" };
    const r = applyChatOverrides(global, { timezone: "UTC" });
    expect(r.timezone).toBe("UTC");
  });

  test("chat undefined inherits the global timezone", () => {
    const global = { ...DEFAULT_SETTINGS, timezone: "Europe/Moscow" };
    const r = applyChatOverrides(global, { systemPrompt: "x" });
    expect(r.timezone).toBe("Europe/Moscow");
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
