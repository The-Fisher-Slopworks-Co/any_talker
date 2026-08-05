<!--
SPDX-License-Identifier: AGPL-3.0-or-later
Copyright (C) 2026 The Fisher Slopworks Co
-->

# AI provider integration

> How `any_talker` talks to its LLM. The bot targets **any OpenAI-compatible
> chat-completions endpoint**, and sends a gateway's proprietary extras only
> where the configured endpoint is known to accept them.

## Endpoint

- Configured by two env vars: `OPENAI_BASE_URL` (must include the version
  segment, e.g. `https://api.openai.com/v1`, `https://openrouter.ai/api/v1`, or a
  self-hosted gateway) and `OPENAI_API_KEY`.
- The client is `src/ai/compat-client.ts` (`OpenAICompatClient`), built on the
  Vercel AI SDK (`ai`) + `@ai-sdk/openai-compatible`. It runs the tool-calling
  loop (`generateText` + `stepCountIs(8)`), maps domain messages to SDK messages,
  and reuses `proxiedFetch` so `HTTP(S)_PROXY` is honoured.
- There is **one** client and one provider package. Gateway-specific body fields
  travel through the SDK's `providerOptions` passthrough: any key that isn't part
  of the SDK's own chat-options schema is spread into the request body verbatim.

## Provider profile

`src/ai/provider-profile.ts` decides what the endpoint may be sent beyond the
standard surface. Two profiles:

| Capability | `openrouter` | `generic` | Effect when on |
|---|---|---|---|
| `modelFallback` | ✅ | ❌ | Trailing ids in `Settings.models` are sent as the `models` chain, tried in order |
| `providerRouting` | ✅ | ❌ | `provider: { sort }` or a pin `{ order: [slug], allow_fallbacks: false }` |
| `serviceTier` | ✅ | ❌ | `service_tier: flex \| priority` |
| `usageAccounting` | ✅ | ❌ | Per-request USD cost read back from `usage.cost` |
| `endpointStats` | ✅ | ❌ | Per-provider price/throughput/latency in the admin model card |
| `unifiedReasoning` | ✅ | ❌ | `reasoning: { effort }` instead of the flat `reasoning_effort` |

**Why the gate is load-bearing:** a strict endpoint — OpenAI's own API among them
— answers `HTTP 400 Unrecognized request argument` when the body carries a field
it doesn't know. A mis-declared profile therefore breaks *every* request, not
just the feature. Nothing proprietary is sent on the generic profile.

The profile is inferred from the `OPENAI_BASE_URL` host (`openrouter.ai` or a
subdomain ⇒ `openrouter`; everything else ⇒ `generic`) and can be pinned with
`AI_PROVIDER_FLAVOR=openrouter|generic|auto` — needed when a proxy or gateway
fronts OpenRouter under its own hostname. An unrecognised value is fatal at boot.

The same capabilities are served to the admin Mini App at `GET /api/provider`, so
it only renders controls the deployment can honour.

## What the bot uses

| Feature | Notes |
|---|---|
| Chat completions + tool calling | Standard `tools` body field; `stepCountIs(8)` bounds the agentic loop. |
| Reasoning effort | Mapped from the `/ask` vs `/askwise` detail level. Sent as `reasoning: { effort }` or `reasoning_effort`, per `unifiedReasoning` — exactly one spelling, never both. |
| Multimodal image input | Generic `image_url` data-URL mapping. |
| Multimodal audio input (`input_audio`) | Accepts **only wav/mp3** — Telegram ogg/opus voice notes are transcoded to mp3 first (`src/bot/transcode.ts`, ffmpeg). |
| Multimodal video input (`video_url`) | Sent as a base64 data URL, but only to a model whose catalogue entry lists `video` among its input modalities (verified live against OpenRouter + Gemini); any other model gets sampled frames instead. This is a **per-model** gate, not a provider-profile one: `video_url` is a content-part shape, so a strict endpoint rejects the model, not the whole body. `@ai-sdk/openai-compatible` cannot express a video part in any version, so the client emits it through message-part `providerOptions.openaiCompatible.content` — pinned by a request-body test in `compat-client.test.ts`. |
| `GET /v1/models` | Server-side catalogue + pricing (`src/ai/model-catalog.ts`). Tolerates a bare `{data:[{id}]}` list and richer gateway shapes with `pricing` / `architecture.input_modalities` / `supported_parameters`; prompt-caching support is inferred from `pricing.input_cache_read` / `input_cache_write`. |
| Token usage (`input`/`output`/`total`) | `input`/`output` drive local cost; `total` drives the rate limiter. |
| App attribution | `HTTP-Referer` / `X-Title` from `OPENROUTER_APP_URL` / `OPENROUTER_APP_TITLE`, sent as request headers. Ignored by endpoints that don't read them. |

## Cost accounting

`resolveAskCost` (`src/ai/compat-client.ts`) picks one of two sources, in order:

1. **Reported.** With `usageAccounting`, each step's raw response body carries
   `usage.cost`; those are summed across the tool-call steps the way tokens are.
   This is the real price — discounts, cache reads and reasoning tokens included.
   A reported `0` (a free model) is a real figure, not a missing one.
2. **Local.** Otherwise: `inputTokens × promptPrice + outputTokens ×
   completionPrice`, priced from the `ModelCatalog`. When the endpoint returns no
   pricing (e.g. a bare OpenAI list), cost is `0` and the result is flagged
   `priced: false`, so the spending UI shows the blind spot rather than passing a
   floor of `$0` off as fact.

The same figure feeds the USD budget caps, so both paths must agree on units —
they are covered by `src/ai/compat-client.test.ts`.

## Endpoint stats (OpenRouter only)

`src/webapp/openrouter-proxy.ts` fetches, server-side and cached for 5 minutes,
the per-provider list for one model: the documented
`/api/v1/models/{permaslug}/endpoints` for the provider list, slugs and pricing,
enriched best-effort with p50 throughput/latency from the **undocumented**
`/api/frontend/stats/endpoint`. The internal endpoint 404s for some models by
design, so every failure there degrades to "no numbers" rather than an error.

Exposed to the Mini App as admin-only `GET /api/openrouter/endpoints/{modelId}`,
and wired into the API only when the profile advertises `endpointStats` — an
absent fetcher *is* the "not supported" answer.

## Not restored

**BYOK** — the per-user API key, the per-user model override, and the
whitelist/rate-limit bypass that came with them. Grant access via the whitelist.
