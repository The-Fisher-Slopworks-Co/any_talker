<!--
SPDX-License-Identifier: AGPL-3.0-or-later
Copyright (C) 2026 The Fisher Slopworks Co
-->

# OpenRouter integration

> How `any_talker` talks to its LLM. The bot targets **OpenRouter**, through
> OpenRouter's own agent library, and sends every routing extra it supports on
> every request — there is no capability gate and no provider-neutral mode.

## Endpoint

- Configured by one required env var, `OPENROUTER_API_KEY`, and one optional
  one, `OPENROUTER_BASE_URL` (defaults to `https://openrouter.ai/api/v1`; must
  include the version segment). Set the base URL only when a proxy or gateway
  fronts OpenRouter under its own hostname. The same value feeds both the API
  client and the catalogue's `GET {base}/models`.
- The client is `src/ai/openrouter-client.ts` (`OpenRouterClient`), built on
  **`@openrouter/agent`** (`callModel`, the tool-calling loop) and
  **`@openrouter/sdk`** (transport, schemas). Both are pinned to an exact
  version — they are pre-1.0 and their wire schemas move.
- The wire call is `POST {base}/responses` — the **Responses API**, not chat
  completions. `callModel` always opens the initial dispatch as a stream
  (`stream: true`, `store: false` and `service_tier: "auto"` are added by the
  SDK); a non-streaming JSON 200 is accepted and materialized.
- Transport is injected: `new HTTPClient({ fetcher: proxiedFetch })`, so
  `HTTP(S)_PROXY` is honoured and tests can assert the exact bytes that go out.
- Retries and timeout are **set explicitly**, never left at the SDK defaults
  (no timeout at all, and a one-hour retry budget): `timeoutMs: 180_000`, and
  exponential backoff 500 ms → 4 s (factor 2) with a 20 s total budget,
  connection errors included. A hung ask would sit far past Telegram's typing
  window and past the top bucket of `bot_ai_request_duration_seconds`.
- Message mapping lives in its own module, `src/ai/responses-input.ts`
  (domain messages → Responses `Item[]`), so the mapping fixtures run without
  an HTTP layer.
- **The SDK reads the environment when a field is unset.** `apiKey`,
  `httpReferer`, `appTitle` and `appCategories` fall back to
  `OPENROUTER_API_KEY` / `OPENROUTER_HTTP_REFERER` / `OPENROUTER_APP_TITLE` /
  `OPENROUTER_APP_CATEGORIES`, memoized process-wide. Inert in production
  (`main.ts` passes all of them explicitly), but a test that asserts the
  *absence* of a header must clear those vars first — Bun auto-loads `.env`.

## What is always sent

Every one of these travels on every request; the old profile gate that decided
which of them an endpoint was allowed to see is gone.

- **The fallback chain** — `model` is the primary, `models` is the *tail* of
  `Settings.models`, tried in order. `models` is omitted entirely when there is
  nothing to fall back to; an empty array is a different request.
- **Provider routing** — `provider: { sort }`, or a pin
  `{ order: [slug], allow_fallbacks: false }`. A **pin outranks a sort**, and a
  pin also outranks session stickiness: an explicit `provider.order` is the last
  word on where the request lands.
- **Service tier** — `service_tier`. The bot only ever sets `flex` or
  `priority`; leaving it unset does not omit the field, because the SDK's
  outbound schema defaults it, so `service_tier: "auto"` goes out instead.
- **Reasoning effort** — `reasoning: { effort }`, OpenRouter's unified spelling
  and now the only one. Mapped from the `/ask` vs `/askwise` detail level.
- **Session id** — `session_id`, clamped to the documented **256 characters at
  the wire boundary** (the SDK does not validate it, and an over-long id costs
  the whole request).
- **Instructions** — the system prompt as a top-level field, never an input
  item. See the prompt-cache note in `ARCHITECTURE.md` §5.

Nothing speculative is ever added: an unrecognised body field is answered with
`HTTP 400 Unrecognized request argument`, which breaks *every* request rather
than just the feature. That is also why `OPENROUTER_BASE_URL` must point at
OpenRouter (or a transparent proxy in front of it) and not at some other
OpenAI-shaped gateway.

## What the bot uses

| Feature | Notes |
|---|---|
| Tool calling | Standard `tools` body field, built per ask from the registry. Omitted entirely when the registry is empty — never `"tools": []`. |
| Loop bound | `stopWhen: stepCountIs(MAX_TOOL_ROUNDS)` — at most **7 tool-execution rounds plus one final tool-free turn = 8 model calls per ask**, rising to **9** in the one case below. The old step cap was a hard 8 with no retry. `allowFinalResponse: ""` forbids tool calls on that final turn but **appends no message**, so nothing is injected into an `en`/`ru` conversation. `strictFinalResponse` is left off, so a completed-but-empty final answer resolves as `text: ""` — `bot/handlers/ask.ts` surfaces that to the user as an AI error, and the ask is still billed. That also lets the library re-send an empty final turn once, which is the 9th call. |
| Multimodal image input | `input_image` item with `detail: "auto"` and a base64 data URL. |
| Multimodal audio input (`input_audio`) | Accepts **only wav/mp3** — Telegram ogg/opus voice notes are transcoded to mp3 first (`src/bot/transcode.ts`, ffmpeg). |
| Multimodal video input (`input_video`) | A first-class item carrying a base64 data URL, sent only to a model whose catalogue entry lists `video` among its input modalities (verified live against OpenRouter + Gemini); any other model gets sampled frames instead. This is a **per-model** gate: the item shape is fine, it is the model that would reject the clip. Pinned by a request-body test in `openrouter-client.test.ts`. |
| `GET {base}/models` | Server-side catalogue (`src/ai/model-catalog.ts`), TTL-cached, hand-rolled rather than routed through the SDK. Feeds the Mini App model picker via `/api/models`, the unknown-id check on write routes, and the native-video gate; tolerates a thin `{data:[{id}]}` list. |
| Session stickiness (`session_id`) | `tg:{botId\|main}:{chatId}` (`src/ai/session.ts`), derived in `runAiTurn` so /ask, guest mode and reminder delivery all agree on what "the same conversation" is. OpenRouter routes a session to the provider whose prompt cache is already warm for it. Advisory: a pinned provider wins. |
| Token usage (`input`/`output`/`total`) | Read off the loop-aggregated totals; `total` drives the rate limiter. |
| App attribution | `HTTP-Referer` from `OPENROUTER_APP_URL`; the title from `OPENROUTER_APP_TITLE` goes out **twice** — as the SDK's `X-OpenRouter-Title` and as the legacy `X-Title`, which the SDK no longer sends and OpenRouter's public attribution docs still name. `X-Title` is added through `callModel`'s `RequestOptions.headers`. Both are asserted by a header test. |

## Cost accounting

`resolveAskCost` (`src/ai/openrouter-client.ts`) has exactly **one** source:
the cost OpenRouter itself reports, aggregated across every model call of the
tool-calling loop. It arrives through the agent's `SessionEnd` hook
(`totalUsage.cost`), which is the only loop-aggregated figure the library
exposes — `getResponse().usage` covers the final call alone and would
under-count every tool-using ask.

- A reported `0` is a **real** cost (a free model), not a missing one.
- An absent or non-finite cost means OpenRouter said nothing: `costUsd` floors
  at `0` and the result is flagged **`priced: false`**, so the spending UI shows
  the blind spot instead of passing a $0 floor off as fact.

The local fallback that priced tokens from the catalogue's per-token rates is
**deleted**. OpenRouter's figure is the authoritative one (cache discounts,
BYOK, reasoning tokens and server-tool usage included), so a computed number
could only ever be the worse of the two — and substituting it silently is
exactly what `priced` exists to prevent. `priced: false` therefore now reads
as *"the ledger under-counts this model"* rather than *"the catalogue was
thin"*, and it still flows through `recordSpend` → the unpriced-model set →
the owner digest and the spend dashboard.

The same figure feeds the USD budget caps; it is covered by
`src/ai/openrouter-client.test.ts`, whose loop-aggregation test is the single
guard against reading per-call usage by mistake.

## Endpoint stats

`src/webapp/openrouter-proxy.ts` fetches, server-side and cached for 5 minutes,
the per-provider list for one model: the documented
`/api/v1/models/{permaslug}/endpoints` for the provider list, slugs and pricing,
enriched best-effort with p50 throughput/latency from the **undocumented**
`/api/frontend/stats/endpoint`. The internal endpoint 404s for some models by
design, so every failure there degrades to "no numbers" rather than an error.

Exposed to the Mini App as admin-only `GET /api/openrouter/endpoints/{modelId}`
and always wired in `main.ts`; an absent fetcher now only happens on a DI
mistake, which the route answers with 503.

## Not restored

- **BYOK** — the per-user API key, the per-user model override, and the
  whitelist/rate-limit bypass that came with them. Grant access via the
  whitelist.
- **`promptCacheKey`** — `session_id` is already OpenRouter's cache-affinity
  key; a second, differently scoped knob carrying the same value risks
  splitting caches for no measured gain.
- **`user`** — the `AIClient` port carries no user id, and shipping Telegram
  user ids to OpenRouter would be a new data-egress decision, not a port.
