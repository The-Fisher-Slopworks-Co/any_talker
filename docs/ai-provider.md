<!--
SPDX-License-Identifier: AGPL-3.0-or-later
Copyright (C) 2026 The Fisher Slopworks Co
-->

# AI provider integration

> How `any_talker` talks to its LLM. The bot targets **any OpenAI-compatible
> chat-completions endpoint** — there is no dependency on a specific gateway.

## Endpoint

- Configured by two env vars: `OPENAI_BASE_URL` (must include the version
  segment, e.g. `https://api.openai.com/v1` or a self-hosted gateway) and
  `OPENAI_API_KEY`.
- The client is `src/ai/compat-client.ts` (`OpenAICompatClient`), built on the
  Vercel AI SDK (`ai`) + `@ai-sdk/openai-compatible`. It runs the tool-calling
  loop (`generateText` + `stepCountIs(8)`), maps domain messages to SDK messages,
  and reuses `proxiedFetch` so `HTTP(S)_PROXY` is honoured.

## What the bot uses (all standard OpenAI surface)

| Feature | Notes |
|---|---|
| Chat completions + tool calling | Standard `tools` body field; `stepCountIs(8)` bounds the agentic loop. |
| `reasoning_effort` | Sent via the `reasoningEffort` provider option (mapped from the `/ask` vs `/askwise` detail level). Honoured by reasoning models, ignored by others. |
| Multimodal image input | Generic `image_url` data-URL mapping. |
| Multimodal audio input (`input_audio`) | Accepts **only wav/mp3** — Telegram ogg/opus voice notes are transcoded to mp3 first (`src/bot/transcode.ts`, ffmpeg). |
| `GET /v1/models` | Server-side catalogue + pricing (`src/ai/model-catalog.ts`). Tolerates a bare `{data:[{id}]}` list and richer gateway shapes with `pricing` / `architecture.input_modalities` / `supported_parameters`. |
| Token usage (`input`/`output`/`total`) | `input`/`output` drive local cost; `total` drives the rate limiter. |

## Cost accounting

A generic endpoint does not return a per-request USD cost. The bot computes it
**locally**: `inputTokens × promptPrice + outputTokens × completionPrice`, where
prices come from the `ModelCatalog` (`/v1/models`). When the endpoint returns no
pricing (e.g. a bare OpenAI list), cost is `0` and `addUserSpend` is a no-op, so
the spending UI simply shows `$0` rather than wrong numbers.

## Deliberately NOT used

OpenRouter-proprietary features the bot previously relied on and has dropped:
server-side model fallback (`models[]` chain), provider routing (`provider.sort` /
pinning), `service_tier`, the `usage.cost` read-back, app-attribution headers
(`HTTP-Referer` / `X-Title`), and the `/api/v1/models/{slug}/endpoints` +
`/api/frontend/stats/endpoint` REST endpoints.
