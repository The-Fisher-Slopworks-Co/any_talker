// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// A local stand-in for OpenRouter, serving the two endpoints the bot under test
// reaches: `GET /models` for the catalogue and `POST /responses` for the ask
// itself. Replies are scripted, so a scenario asserts on an exact string rather
// than on whatever a live model felt like saying, and every ask is recorded, so
// it can also assert on what the model was handed. No tokens are spent and no
// run depends on the gateway being up.

import { DEFAULT_SETTINGS } from "../src/shared/types";

// The API version segment OpenRouter's own base URL carries. Kept so the bot
// under test is configured with a URL shaped exactly like the production one —
// `model-catalog.ts` appends `/models` to it and the SDK appends `/responses`.
const BASE_PATH = "/api/v1";

// The single model the catalogue publishes. An unconfigured bot asks for the
// first of `DEFAULT_SETTINGS.models`, so pinning the entry to it is what lets a
// scenario `/ask` without writing settings first.
const CATALOGUE_MODEL = DEFAULT_SETTINGS.models[0] ?? "openrouter/auto";

// Per-token prices and the cost of one ask. Non-zero, so the spending ledger
// records something real, but small enough that a whole suite stays far under
// the default budget caps.
const PROMPT_PRICE = "0.000001";
const COMPLETION_PRICE = "0.000002";
const REPLY_COST_USD = 0.000_123;

// How much of the user's own text an unscripted reply echoes back.
const ECHO_MAX = 200;

// A `POST /responses` body, as OpenRouter would have received it: snake-cased
// and already parsed. Only the fields assertions reach for are named.
export type ResponsesBody = {
  model?: unknown;
  instructions?: unknown;
  input?: unknown;
  tools?: unknown;
} & Record<string, unknown>;

type RecordedAsk = {
  body: ResponsesBody;
  // The `authorization` header the bot sent, so a scenario can prove the API
  // key travelled without the mock ever validating it.
  authorization: string | null;
  // The text this ask was answered with — the string a scenario then waits for
  // in the chat.
  replyText: string;
};

export type MockOpenRouter = {
  // Value for the bot's `OPENROUTER_BASE_URL`, API version segment included.
  baseUrl: string;
  // Every `POST /responses` this mock served, oldest first.
  asks: RecordedAsk[];
  // Queues replies for the next asks, in order. An ask past the end of the
  // queue gets the echo default.
  script(...texts: string[]): void;
  // Drops the queue and the recorded asks: one scenario must never read the
  // previous one's traffic.
  reset(): void;
  stop(): Promise<void>;
};

export function startMockOpenRouter(): MockOpenRouter {
  const asks: RecordedAsk[] = [];
  const queued: string[] = [];

  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const { pathname } = new URL(req.url);

      if (req.method === "GET" && pathname === `${BASE_PATH}/models`) {
        return Response.json({ data: [catalogueEntry()] });
      }

      if (req.method === "POST" && pathname === `${BASE_PATH}/responses`) {
        const body = (await req.json()) as ResponsesBody;
        const replyText = queued.shift() ?? echoReply(body);
        asks.push({
          body,
          authorization: req.headers.get("authorization"),
          replyText,
        });
        return Response.json(responsePayload(body, replyText));
      }

      // Anything else is the bot reaching for an endpoint this mock does not
      // model. Naming the route in the body turns that into a legible failure
      // instead of a hang.
      return Response.json(
        {
          error: {
            message: `mock openrouter: no route for ${req.method} ${pathname}`,
          },
        },
        { status: 404 },
      );
    },
  });

  return {
    baseUrl: `http://127.0.0.1:${server.port}${BASE_PATH}`,
    asks,
    script(...texts: string[]) {
      queued.push(...texts);
    },
    reset() {
      asks.length = 0;
      queued.length = 0;
    },
    async stop() {
      await server.stop(true);
    },
  };
}

// Flattens the text of a request's `input` items into one string, so a scenario
// can assert that a chat message reached the model without walking the
// Responses item shapes itself.
export function askedText(body: ResponsesBody): string {
  return itemsOf(body).map(itemText).filter(Boolean).join("\n");
}

// One `/models` entry, rich enough for every consumer the catalogue has: text
// modality (the native-video gate reads it), tool support and both per-token
// prices (the Mini App picker renders them).
function catalogueEntry() {
  return {
    id: CATALOGUE_MODEL,
    name: "Mock model (e2e)",
    architecture: {
      input_modalities: ["text"],
      output_modalities: ["text"],
    },
    supported_parameters: ["tools"],
    pricing: { prompt: PROMPT_PRICE, completion: COMPLETION_PRICE },
  };
}

// The minimal `POST /responses` 200 the SDK's inbound schema accepts, carrying
// one assistant message.
function responsePayload(body: ResponsesBody, text: string) {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: `resp_${nonce()}`,
    object: "response",
    created_at: now,
    completed_at: now,
    error: null,
    incomplete_details: null,
    instructions: null,
    metadata: null,
    // Echoed back, the way a real gateway names the model it landed on.
    model: typeof body.model === "string" ? body.model : CATALOGUE_MODEL,
    output: [
      {
        type: "message",
        id: `msg_${nonce()}`,
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text, annotations: [] }],
      },
    ],
    parallel_tool_calls: true,
    presence_penalty: 0,
    frequency_penalty: 0,
    temperature: 1,
    tool_choice: "auto",
    tools: [],
    top_p: 1,
    status: "completed",
    usage: {
      input_tokens: 10,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: 5,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 15,
      cost: REPLY_COST_USD,
    },
  };
}

// The reply an unscripted ask gets: a fresh nonce, so a leftover message from an
// earlier run can never satisfy a scenario's assertion, plus the user's own
// text, so an unexpected extra ask is identifiable in the chat it lands in.
function echoReply(body: ResponsesBody): string {
  const echoed = lastUserText(body).slice(0, ECHO_MAX);
  const marker = `e2e-${nonce()}`;
  return echoed ? `${marker} ${echoed}` : marker;
}

function lastUserText(body: ResponsesBody): string {
  const items = itemsOf(body);
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (isRecord(item) && item.role === "user") return itemText(item);
  }
  return "";
}

function itemsOf(body: ResponsesBody): unknown[] {
  return Array.isArray(body.input) ? body.input : [];
}

// The text of one input item. `content` is a bare string for the plain-text
// messages the bot sends, and an array of `input_text`/media parts once a
// message carries an attachment; media parts have no `text` and drop out.
function itemText(item: unknown): string {
  if (!isRecord(item)) return "";
  const { content } = item;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) =>
      isRecord(part) && typeof part.text === "string" ? part.text : "",
    )
    .filter(Boolean)
    .join("\n");
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function nonce(): string {
  return crypto.randomUUID().slice(0, 8);
}
