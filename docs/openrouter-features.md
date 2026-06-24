<!--
SPDX-License-Identifier: AGPL-3.0-or-later
Copyright (C) 2026 The Fisher Slopworks Co
-->

# OpenRouter-specific features used by `any_talker`

> Catalogue of every **OpenRouter-ecosystem** feature the codebase relies on,
> separated from plain OpenAI-compatible API behaviour. Each entry was verified
> against the OpenRouter docs. Evidence is given as `file:line` references.
>
> Method: a multi-agent audit (4 parallel finders by lens → consolidation →
> per-feature verification against <https://openrouter.ai/docs>).

## TL;DR

- Everything that customises a request goes through the
  `@openrouter/ai-sdk-provider` `providerOptions.openrouter` passthrough
  (`src/ai/openrouter.ts:98-138`): model fallback, provider routing,
  `service_tier`, `reasoning`, `usage` accounting.
- Catalogue / provider metadata comes from OpenRouter REST endpoints
  (`/api/v1/models`, `/api/v1/models/{permaslug}/endpoints`, and the internal
  `/api/frontend/stats/endpoint`).
- Web search is **not** an OpenRouter feature — it uses Firecrawl
  (`src/ai/tools/search-web.ts`).

---

## 1. Request body params (via `providerOptions.openrouter`)

All passed into the chat-completions body through the `@openrouter/ai-sdk-provider`
passthrough — see `src/ai/openrouter.ts:98-138`.

| # | Feature | Mechanism / evidence | Notes |
|---|---------|----------------------|-------|
| 1 | **Model fallback list `models`** | primary → AI SDK `model`, rest → `openrouterOpts.models`; OR tries next on failure. `src/ai/openrouter.ts:70,109` | No equivalent in vanilla OpenAI; docs tell you to send via `extra_body`. [model-fallbacks](https://openrouter.ai/docs/guides/routing/model-fallbacks) |
| 2 | **Provider routing** | `buildProviderRouting()` emits `{ sort }` (`price\|throughput\|latency`) or a pin `{ order: [slug], allow_fallbacks: false }`. `src/ai/openrouter.ts:34-41,110-116` | Pin is stricter than OR default (`allow_fallbacks` defaults to `true`). [provider-selection](https://openrouter.ai/docs/guides/routing/provider-selection) |
| 3 | **Provider-slug syntax + variants** | `isValidProviderSlug` / `PROVIDER_SLUG_RE` (`src/shared/types.ts:193-202`); `baseProviderSlug()` collapses quant/region variants (`deepinfra/fp4`, `amazon-bedrock/eu-west-1`) to the base slug (`src/webapp/ui/openrouter-models.ts:100-125`) | OR routes a base slug to all its variants. Regex/length cap are the bot's own choices, not an OR contract. |
| 4 | **`service_tier` = `flex\|priority`** | `src/ai/openrouter.ts:117-121`; validated `isValidServiceTier` (`src/shared/types.ts:204-206`) | ⚠️ Field name shared with OpenAI; OR-specific part is **cross-provider normalisation** of tiers. [service-tiers](https://openrouter.ai/docs/guides/features/service-tiers) |
| 5 | **`reasoning: { effort }`** | `src/ai/openrouter.ts:122-124`; mapped from DetailLevel (`src/ai/instruction.ts:23-30`) | OR's unified reasoning object (vs OpenAI's flat `reasoning_effort`). Code uses only `low\|high`; OR accepts `max/xhigh/high/medium/low/minimal/none`. [reasoning-tokens](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens) |
| 6 | **Usage accounting + cost read-back** | `usage: { include: true }` → read `providerMetadata.openrouter.usage.cost`, summed across tool-call steps in `sumStepCostUsd`. `src/ai/openrouter.ts:103-108,180-195` | ⚠️ The `include` flag is now **deprecated/no-op** (cost always returned); the per-request USD cost read-back is the real OR feature (OpenAI `usage` has tokens only). [usage-accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting) |
| 7 | **`providerOptions.openrouter` passthrough** | The OR provider spreads any key straight into the request body. `src/ai/openrouter.ts:98-138` | Behaviour of the OR provider package, not AI SDK core. |

**Deliberately NOT used** (verified zero occurrences via grep): OR body fields
`transforms` (middle-out), `plugins` (web search / file-parser), `max_price`,
`data_collection`, `require_parameters`, `quantizations`. `openrouterOpts` is
closed at exactly `{ models?, provider?, service_tier?, reasoning?, usage? }`
(`src/ai/openrouter.ts:98-124`).

---

## 2. SDK / auth / attribution

| # | Feature | Mechanism / evidence | Notes |
|---|---------|----------------------|-------|
| 8 | **`@openrouter/ai-sdk-provider` + `createOpenRouter`** | `package.json:25`, `src/ai/openrouter.ts:11,51` | Central integration point; the host `ai` SDK is provider-agnostic. [vercel-ai-sdk](https://openrouter.ai/docs/guides/community/vercel-ai-sdk) |
| 9 | **`OPENROUTER_API_KEY`** | `src/config.ts:33`, `src/main.ts:41` | Bearer transport is generic; the env-var name + openrouter.ai-issued key are ecosystem-specific. |
| 10 | **App attribution headers `HTTP-Referer` / `X-Title`** | `buildAttributionHeaders` (`src/ai/openrouter.ts:197-204`); config `OPENROUTER_APP_URL`/`OPENROUTER_APP_TITLE` (`src/config.ts:34-35`) | Drive the openrouter.ai leaderboard/dashboard. ⚠️ `X-Title` is now a legacy alias for `X-OpenRouter-Title`. [app-attribution](https://openrouter.ai/docs/app-attribution) |
| 11 | **BYOK — per-user OpenRouter key (`sk-or-…`)** | Storage (`src/storage/keydb.ts:368-376`), REST `GET/PUT /api/me/openrouter-key` (`src/webapp/api.ts:484-509`), per-request `createOpenRouter({ apiKey })` (`src/ai/openrouter.ts:77-84`) | ⚠️ "Inverse BYOK": end-users supply *their own OR key*; this is **not** OpenRouter's own BYOK (upstream provider keys). Transport is plain Bearer; validation is length-only. |
| 12 | **BYOK per-user model override list** | Storage (`src/storage/keydb.ts:378-405`), REST `GET/PUT /api/me/openrouter-models` (`src/webapp/api.ts:511-523`), applied in `src/bot/handlers/ask.ts:196-200` | Sent to OR as the fallback chain; active only with a BYOK key. Cap = 10. |

---

## 3. Multimodality

| # | Feature | Mechanism / evidence | Notes |
|---|---------|----------------------|-------|
| 13 | **Audio → `input_audio`** | `toModelMessages` maps audio → generic `file` part; the OR provider converts an `audio/*` file part into the `input_audio` body field. `src/ai/openrouter.ts:157-178` | Telegram voice notes are `audio/ogg`; **ogg is accepted by OR** (OpenAI's `input_audio` accepts only wav/mp3). Image parts use the generic `{ type: image }` mapping (not OR-specific). [multimodal/audio](https://openrouter.ai/docs/guides/overview/multimodal/audio) |

---

## 4. REST endpoints on openrouter.ai

| # | Feature | Mechanism / evidence | Notes |
|---|---------|----------------------|-------|
| 14 | **`GET /api/v1/models`** | `fetchOpenRouterModels` (`src/webapp/ui/openrouter-models.ts:41-55`) | OpenAI's `/v1/models` is a flat id list; OR extends it with the fields below. [list-models](https://openrouter.ai/docs/api-reference/list-available-models) |
| 15 | ↳ **`supported_parameters`** | `supportsTools()` checks for `"tools"`. `src/webapp/ui/openrouter-models.ts:21,171-173` | OR catalogue extension. |
| 16 | ↳ **`architecture.input_modalities`** | `src/webapp/ui/openrouter-models.ts:18-20`; rendered in model card | OR-specific nesting. |
| 17 | ↳ **`pricing.input_cache_read` / `input_cache_write`** | `supportsCaching()` (`src/webapp/ui/openrouter-models.ts:175-180`) | Per-token cache-price fields used as a prompt-caching capability heuristic. |
| 18 | ↳ **Per-token USD price strings** | `pricing.prompt/completion/image` → `formatPricePerMillion` (×1e6). `src/webapp/ui/openrouter-models.ts:182-192` | Units are USD per single token. |
| 19 | **`GET /api/v1/models/{permaslug}/endpoints`** | `fetchPublicEndpoints` (`src/webapp/openrouter-proxy.ts:59-85`) | Per-model provider list; routing slug in field `tag`; per-provider pricing. Slug `/` deliberately not URL-encoded. [list-endpoints](https://openrouter.ai/docs/api/api-reference/endpoints/list-endpoints) |
| 20 | **`GET /api/frontend/stats/endpoint`** | `fetchSlugStats` (`src/webapp/openrouter-proxy.ts:90-119`) | ⚠️ **Internal/undocumented** frontend API; p50 throughput/latency by `provider_slug`. Best-effort enrichment; degrades to empty on failure. |
| 21 | **App-internal proxy `GET /api/openrouter/endpoints/{modelId}`** | `src/webapp/api.ts:534-553` → `fetchOpenRouterStats` (`src/webapp/openrouter-proxy.ts:121-141`) | On the bot's own server (auth `tma <initData>`, 5-min cache); exists solely to expose #19 + #20 to the Mini App. The route/auth/cache wrapper is app-specific; the data is OR-specific. |

---

## 5. Model-id conventions

| # | Feature | Mechanism / evidence | Notes |
|---|---------|----------------------|-------|
| 22 | **Routing suffixes `:nitro` / `:floor` / `:online` / `:free`** | `lookupOpenRouterModel` tries the exact id, then the part before the last `:`. `src/webapp/ui/openrouter-models.ts:156-169` | Used for catalogue/UI lookup; the raw suffixed id is sent verbatim and OR resolves server-side. `:nitro`=throughput, `:floor`=price, `:online` is **deprecated** (→ web-search plugin), `:free` is a real catalogue id. [model-variants](https://openrouter.ai/docs/guides/routing/model-variants/nitro) |
| 23 | **`openrouter/auto` (Auto Router)** | Mentioned only in a comment (`src/webapp/ui/openrouter-models.ts:156`) | **Not implemented** — no code sets `openrouter/auto`. `:auto` is listed loosely in that comment (OR's auto is a standalone model id, not a suffix). [auto-router](https://openrouter.ai/docs/guides/routing/routers/auto-router) |

---

## 6. Explicitly NOT OpenRouter-specific (generic, for reference)

| Item | Why generic |
|------|-------------|
| Tool-calling (`tools` + `stepCountIs(8)`) | Standard OpenAI / AI-SDK; sent via the standard `tools` body field. `src/ai/openrouter.ts:86-96,131-133` |
| Injected `fetch` (proxy) | Generic AI-SDK provider capability. `src/ai/openrouter.ts:53` |
| Web search | Uses **Firecrawl**, not OR's web-search plugin/`:online`. `src/ai/tools/search-web.ts:8` |
| Image input (`{ type: image }`) | Generic AI-SDK multimodal mapping. `src/ai/openrouter.ts:171` |

---

## Key doc-verification caveats

- `usage: { include: true }` is **deprecated** — usage (incl. cost) is always
  returned; the response-side read-back is what matters.
- `X-Title` → legacy alias for `X-OpenRouter-Title`.
- `reasoning.effort` accepts more values than the `low|high` the code uses.
- `:online` is deprecated in favour of the web-search plugin.
- `/api/frontend/stats/endpoint` is undocumented. The **documented** public
  `/endpoints` route does return `latency_last_30m` / `throughput_last_30m`,
  but only with a Bearer token — the code calls `/endpoints` anonymously, so it
  sources throughput/latency from the internal endpoint instead.
