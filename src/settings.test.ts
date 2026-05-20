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
        detailedMultiplier: 1.5,
        wiseMultiplier: 2,
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
        detailedMultiplier: 1.5,
        wiseMultiplier: 2,
      },
      timezone: DEFAULT_SETTINGS.timezone,
      providerSort: DEFAULT_SETTINGS.providerSort,
      expandableBlockquoteThreshold:
        DEFAULT_SETTINGS.expandableBlockquoteThreshold,
    });
  });

  test("normalizes chat rateLimit override when multipliers are missing", () => {
    const r = applyChatOverrides(DEFAULT_SETTINGS, {
      rateLimit: {
        capacity: 1,
        refillAmount: 1,
        refillIntervalMs: 1000,
        ownerExempt: false,
      } as never,
    });
    expect(r.rateLimit.detailedMultiplier).toBe(
      DEFAULT_SETTINGS.rateLimit.detailedMultiplier,
    );
    expect(r.rateLimit.wiseMultiplier).toBe(
      DEFAULT_SETTINGS.rateLimit.wiseMultiplier,
    );
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

  test("normalize fills defaults for missing multipliers in stored settings", async () => {
    const storage = new MemoryStorage();
    const legacy = {
      ...DEFAULT_SETTINGS,
      rateLimit: {
        capacity: 1,
        refillAmount: 1,
        refillIntervalMs: 1000,
        ownerExempt: false,
      } as never,
    };
    await storage.saveSettings(legacy);
    const s = await getOrInitSettings(storage);
    expect(s.rateLimit.detailedMultiplier).toBe(
      DEFAULT_SETTINGS.rateLimit.detailedMultiplier,
    );
    expect(s.rateLimit.wiseMultiplier).toBe(
      DEFAULT_SETTINGS.rateLimit.wiseMultiplier,
    );
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
