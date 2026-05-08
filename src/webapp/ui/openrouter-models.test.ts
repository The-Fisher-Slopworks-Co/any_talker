import { test, expect, describe } from "bun:test";
import {
  lookupOpenRouterModel,
  pickEndpointBySort,
  type OpenRouterEndpoint,
  type OpenRouterModel,
} from "./openrouter-models";

const ep = (
  provider_name: string,
  prompt: string | undefined,
  completion: string | undefined,
  throughput: number | null,
  latency: number | null,
): OpenRouterEndpoint => ({
  provider_name,
  pricing: { prompt, completion },
  throughput_last_30m: throughput,
  latency_last_30m: latency,
});

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

describe("pickEndpointBySort", () => {
  const A = ep("A", "0.000000040", "0.00000020", 100, 500);
  const B = ep("B", "0.000000039", "0.00000018", 80, 700);
  const C = ep("C", "0.000000050", "0.00000025", 150, 300);

  test("returns null on empty input", () => {
    expect(pickEndpointBySort([], "price")).toBeNull();
  });

  test("price: picks lowest sum of prompt+completion", () => {
    expect(pickEndpointBySort([A, B, C], "price")?.provider_name).toBe("B");
  });

  test("price: missing pricing on a candidate counts as worst", () => {
    const noPrice = ep("X", undefined, undefined, 200, 50);
    expect(pickEndpointBySort([A, noPrice], "price")?.provider_name).toBe("A");
  });

  test("throughput: picks highest, ignoring nulls", () => {
    const nullTp = ep("X", "0", "0", null, 10);
    expect(pickEndpointBySort([A, B, C, nullTp], "throughput")?.provider_name).toBe(
      "C",
    );
  });

  test("throughput: returns null when no candidate has data", () => {
    const x = ep("X", "0", "0", null, 10);
    const y = ep("Y", "0", "0", null, 20);
    expect(pickEndpointBySort([x, y], "throughput")).toBeNull();
  });

  test("latency: picks lowest, ignoring nulls", () => {
    const nullLat = ep("X", "0", "0", 999, null);
    expect(pickEndpointBySort([A, B, C, nullLat], "latency")?.provider_name).toBe(
      "C",
    );
  });

  test("latency: returns null when no candidate has data", () => {
    const x = ep("X", "0", "0", 100, null);
    expect(pickEndpointBySort([x], "latency")).toBeNull();
  });
});
