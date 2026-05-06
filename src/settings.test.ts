import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "./storage/memory";
import { getOrInitSettings } from "./settings";
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
