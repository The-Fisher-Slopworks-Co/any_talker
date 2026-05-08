import { test, expect, describe } from "bun:test";
import { lookupOpenRouterModel, type OpenRouterModel } from "./openrouter-models";

const model = (id: string, name: string): OpenRouterModel => ({
  id,
  name,
  pricing: {},
});

describe("lookupOpenRouterModel", () => {
  test("returns the exact match when present", () => {
    const cat = new Map([["openai/gpt-oss-20b", model("openai/gpt-oss-20b", "GPT OSS")]]);
    expect(lookupOpenRouterModel(cat, "openai/gpt-oss-20b")?.name).toBe("GPT OSS");
  });

  test("falls back to the base model for :nitro shortcut", () => {
    const cat = new Map([["openai/gpt-oss-20b", model("openai/gpt-oss-20b", "GPT OSS")]]);
    expect(lookupOpenRouterModel(cat, "openai/gpt-oss-20b:nitro")?.name).toBe("GPT OSS");
  });

  test("falls back to the base model for :floor shortcut", () => {
    const cat = new Map([["openai/gpt-oss-20b", model("openai/gpt-oss-20b", "GPT OSS")]]);
    expect(lookupOpenRouterModel(cat, "openai/gpt-oss-20b:floor")?.name).toBe("GPT OSS");
  });

  test("prefers exact match over base lookup (e.g. :free is a real ID)", () => {
    const cat = new Map([
      ["meta/llama:free", model("meta/llama:free", "Llama Free")],
      ["meta/llama", model("meta/llama", "Llama")],
    ]);
    expect(lookupOpenRouterModel(cat, "meta/llama:free")?.name).toBe("Llama Free");
  });

  test("returns null when neither exact nor base is present", () => {
    const cat = new Map<string, OpenRouterModel>();
    expect(lookupOpenRouterModel(cat, "vendor/unknown:nitro")).toBeNull();
  });

  test("returns null for an id with no colon and no exact match", () => {
    const cat = new Map<string, OpenRouterModel>();
    expect(lookupOpenRouterModel(cat, "vendor/unknown")).toBeNull();
  });

  test("does not strip a leading colon (no base before it)", () => {
    const cat = new Map<string, OpenRouterModel>();
    expect(lookupOpenRouterModel(cat, ":nitro")).toBeNull();
  });
});
