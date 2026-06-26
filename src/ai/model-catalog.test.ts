// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { createModelCatalog, parseModelEntry } from "./model-catalog";

describe("parseModelEntry", () => {
  test("bare OpenAI shape: id only, no pricing/capabilities", () => {
    const info = parseModelEntry({ id: "gpt-4o", object: "model" });
    expect(info).toEqual({ id: "gpt-4o" });
  });

  test("richer gateway shape: parses pricing and capabilities", () => {
    const info = parseModelEntry({
      id: "anthropic/claude-sonnet-4-5",
      name: "Claude Sonnet 4.5",
      pricing: { prompt: "0.000003", completion: "0.000015", image: "0.0048" },
      architecture: { input_modalities: ["text", "image"] },
      supported_parameters: ["tools", "reasoning"],
    });
    expect(info).toEqual({
      id: "anthropic/claude-sonnet-4-5",
      name: "Claude Sonnet 4.5",
      pricing: {
        promptPerToken: 0.000003,
        completionPerToken: 0.000015,
        imagePerToken: 0.0048,
      },
      capabilities: { modalities: ["text", "image"], tools: true },
    });
  });

  test("returns null when id is missing or not a string", () => {
    expect(parseModelEntry({ name: "x" })).toBeNull();
    expect(parseModelEntry({ id: 42 })).toBeNull();
    expect(parseModelEntry(null)).toBeNull();
  });

  test("drops pricing when prompt/completion are non-numeric", () => {
    const info = parseModelEntry({
      id: "x",
      pricing: { prompt: "n/a", completion: "0.00001" },
    });
    expect(info).toEqual({ id: "x" });
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("createModelCatalog", () => {
  const priced = {
    data: [
      {
        id: "m1",
        pricing: { prompt: "0.000001", completion: "0.000002" },
      },
      { id: "m2" },
    ],
  };

  test("list returns normalized entries and getPricing resolves prices", async () => {
    const catalog = createModelCatalog({
      baseURL: "https://api.example.com/v1",
      apiKey: "k",
      fetch: async () => jsonResponse(priced),
    });
    await catalog.refresh();
    const list = await catalog.list();
    expect(list.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(catalog.getPricing("m1")).toEqual({
      promptPerToken: 0.000001,
      completionPerToken: 0.000002,
    });
    // m2 has no pricing → null; unknown model → null.
    expect(catalog.getPricing("m2")).toBeNull();
    expect(catalog.getPricing("nope")).toBeNull();
  });

  test("getPricing strips a trailing :variant tag", async () => {
    const catalog = createModelCatalog({
      baseURL: "https://api.example.com/v1",
      apiKey: "k",
      fetch: async () => jsonResponse(priced),
    });
    await catalog.refresh();
    expect(catalog.getPricing("m1:nitro")).toEqual({
      promptPerToken: 0.000001,
      completionPerToken: 0.000002,
    });
  });

  test("builds the URL from baseURL + /models with an auth header", async () => {
    let seenUrl = "";
    let seenAuth = "";
    const catalog = createModelCatalog({
      baseURL: "https://api.example.com/v1/",
      apiKey: "secret",
      fetch: async (url, init) => {
        seenUrl = String(url);
        seenAuth = init?.headers?.authorization ?? "";
        return jsonResponse(priced);
      },
    });
    await catalog.refresh();
    expect(seenUrl).toBe("https://api.example.com/v1/models");
    expect(seenAuth).toBe("Bearer secret");
  });

  test("degrades gracefully when the endpoint errors", async () => {
    const catalog = createModelCatalog({
      baseURL: "https://api.example.com/v1",
      apiKey: "k",
      fetch: async () => jsonResponse({ error: "nope" }, 500),
    });
    // list() swallows the error and serves an empty catalogue; getPricing → null.
    const list = await catalog.list();
    expect(list).toEqual([]);
    expect(catalog.getPricing("m1")).toBeNull();
  });

  test("caches within the TTL (a second list() reuses the fetch)", async () => {
    let fetches = 0;
    const catalog = createModelCatalog({
      baseURL: "https://api.example.com/v1",
      apiKey: "k",
      ttlMs: 60_000,
      fetch: async () => {
        fetches++;
        return jsonResponse(priced);
      },
    });
    await catalog.list();
    await catalog.list();
    expect(fetches).toBe(1);
  });

  test("an expired TTL refetches", async () => {
    let fetches = 0;
    const catalog = createModelCatalog({
      baseURL: "https://api.example.com/v1",
      apiKey: "k",
      ttlMs: 0,
      fetch: async () => {
        fetches++;
        return jsonResponse(priced);
      },
    });
    await catalog.list();
    await catalog.list();
    expect(fetches).toBe(2);
  });

  test("unknownModels flags only ids absent from the catalogue", async () => {
    const catalog = createModelCatalog({
      baseURL: "https://api.example.com/v1",
      apiKey: "k",
      fetch: async () => jsonResponse(priced),
    });
    // m1/m2 are known (even though m2 has no pricing); "ghost" is not.
    expect(await catalog.unknownModels(["m1", "m2", "ghost"])).toEqual([
      "ghost",
    ]);
    expect(await catalog.unknownModels(["m1"])).toEqual([]);
  });

  test("unknownModels resolves a :variant suffix and trims input", async () => {
    const catalog = createModelCatalog({
      baseURL: "https://api.example.com/v1",
      apiKey: "k",
      fetch: async () => jsonResponse(priced),
    });
    expect(await catalog.unknownModels(["m1:nitro", "  m2  "])).toEqual([]);
  });

  test("unknownModels allows everything when the catalogue is unavailable", async () => {
    const catalog = createModelCatalog({
      baseURL: "https://api.example.com/v1",
      apiKey: "k",
      fetch: async () => jsonResponse({ error: "nope" }, 500),
    });
    // Empty catalogue → nothing to validate against → all allowed.
    expect(await catalog.unknownModels(["anything", "at-all"])).toEqual([]);
  });
});
