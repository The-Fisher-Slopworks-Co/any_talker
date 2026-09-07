// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// The mock is exercised through the bot's own OpenRouter code — the real
// `createModelCatalog` and the real `OpenRouterClient` — because that is the
// only thing it has to be compatible with. A hand-rolled fetch here would
// assert the mock matches this file's idea of the wire, not the SDK's.

import { beforeEach, afterAll, expect, test } from "bun:test";
import { askedText, startMockOpenRouter } from "./mock-openrouter";
import { createModelCatalog } from "../src/ai/model-catalog";
import { OpenRouterClient } from "../src/ai/openrouter-client";
import type { AIMessage } from "../src/ai/types";
import type { Tool, ToolCallContext } from "../src/ai/tools/registry";
import { DEFAULT_SETTINGS } from "../src/shared/types";

const mock = startMockOpenRouter();

beforeEach(() => {
  mock.reset();
});

afterAll(async () => {
  await mock.stop();
});

const client = new OpenRouterClient({
  apiKey: "sk-e2e",
  baseURL: mock.baseUrl,
  // A deliberate failure must surface as one request, not five.
  retryConfig: { strategy: "none" },
});

const ask = (messages: AIMessage[]) =>
  client.ask({
    models: DEFAULT_SETTINGS.models,
    system: "sys",
    messages,
    tools: [] as Tool[],
    toolCallContext: {} as ToolCallContext,
  });

const user = (content: string): AIMessage => ({ role: "user", content });

test("the catalogue publishes the model an unconfigured bot asks for", async () => {
  const catalog = createModelCatalog({
    baseURL: mock.baseUrl,
    apiKey: "sk-e2e",
  });

  expect(await catalog.list()).toEqual([
    {
      id: DEFAULT_SETTINGS.models[0]!,
      name: "Mock model (e2e)",
      pricing: { promptPerToken: 0.000001, completionPerToken: 0.000002 },
      capabilities: { modalities: ["text"], tools: true, caching: false },
    },
  ]);
  // The gate the entry exists for: nothing in it may be read as "unknown".
  expect(await catalog.unknownModels(DEFAULT_SETTINGS.models)).toEqual([]);
});

test("a scripted reply comes back as the answer, with the ask recorded", async () => {
  mock.script("scripted answer");

  const result = await ask([user("hello")]);

  expect(result.text).toBe("scripted answer");
  expect(result.modelId).toBe(DEFAULT_SETTINGS.models[0]!);
  expect(result.totalTokens).toBe(15);
  expect(result.priced).toBe(true);
  expect(result.costUsd).toBeCloseTo(0.000123, 9);

  expect(mock.asks).toHaveLength(1);
  const [recorded] = mock.asks;
  expect(recorded!.authorization).toBe("Bearer sk-e2e");
  expect(recorded!.replyText).toBe("scripted answer");
  expect(recorded!.body.instructions).toBe("sys");
  expect(askedText(recorded!.body)).toBe("hello");
});

test("the queue drains in order, then every ask echoes under a fresh nonce", async () => {
  mock.script("first", "second");

  expect((await ask([user("a")])).text).toBe("first");
  expect((await ask([user("b")])).text).toBe("second");

  const third = (await ask([user("unscripted")])).text;
  const fourth = (await ask([user("unscripted")])).text;
  expect(third).toMatch(/^e2e-[0-9a-f]{8} unscripted$/);
  // The nonce is what keeps a leftover message from an earlier run from
  // satisfying a scenario waiting on this one.
  expect(fourth).not.toBe(third);
});

test("askedText flattens the whole replayed conversation", async () => {
  await ask([
    user("first turn"),
    { role: "assistant", content: "an earlier answer" },
    user("follow-up"),
  ]);

  const text = askedText(mock.asks[0]!.body);
  expect(text).toBe("first turn\nan earlier answer\nfollow-up");
});

test("reset drops both the queue and the recorded asks", async () => {
  mock.script("stale");
  await ask([user("hi")]);
  expect(mock.asks).toHaveLength(1);

  mock.reset();

  expect(mock.asks).toHaveLength(0);
  expect((await ask([user("hi")])).text).not.toBe("stale");
});

test("an endpoint the mock does not model answers 404, not silence", async () => {
  const res = await fetch(`${mock.baseUrl}/chat/completions`, {
    method: "POST",
  });
  expect(res.status).toBe(404);
  expect(await res.json()).toMatchObject({
    error: {
      message: expect.stringContaining("POST /api/v1/chat/completions"),
    },
  });
});
