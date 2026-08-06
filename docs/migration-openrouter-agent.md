<!--
SPDX-License-Identifier: AGPL-3.0-or-later
Copyright (C) 2026 The Fisher Slopworks Co
-->

# Migration: OpenAI-compatible API → OpenRouter

This release drops the provider-neutral wire layer. The bot now talks to
OpenRouter's Responses API through OpenRouter's own `@openrouter/agent` +
`@openrouter/sdk`, and there is no longer a "generic endpoint" mode: pointing
the bot at a plain OpenAI or a self-hosted LiteLLM/vLLM gateway is no longer
supported. See [`ai-provider.md`](./ai-provider.md) for what goes on the wire.

What you **must** do to deploy it:

1. **Rename two env vars in `.env`** (gitignored, not changed for you):

   ```dotenv
   OPENROUTER_API_KEY=<your key>        # was OPENAI_API_KEY
   # OPENROUTER_BASE_URL=…              # was OPENAI_BASE_URL — now optional
   ```

   `OPENROUTER_BASE_URL` defaults to `https://openrouter.ai/api/v1`, so most
   deployments can simply drop it; set it only when a proxy or a self-hosted
   gateway fronts OpenRouter under its own hostname (include the version
   segment). One config value feeds both the API client and the model
   catalogue's `GET {base}/models`.

   **The old names keep working for one release.** If `OPENROUTER_API_KEY` /
   `OPENROUTER_BASE_URL` are unset, the bot falls back to the previous
   `OPENAI_*` names and logs one deprecation warning naming each var that fell
   back. The fallback will be removed; rename now.

2. **Remove `AI_PROVIDER_FLAVOR`** if you set it. The provider capability
   profile is gone — there is nothing left to select, and the variable is
   ignored. Everything it used to gate (model fallback chain, provider routing,
   service tiers, sticky per-conversation routing, endpoint stats in the admin
   model picker) is now always on, and every control the admin UI renders is
   always sent.

3. **`bun install`** — the AI dependencies changed (`ai` and
   `@ai-sdk/openai-compatible` are gone; `@openrouter/agent` and
   `@openrouter/sdk` are in, pinned exactly). `bun.lock` is part of the
   release, and the Docker image installs with `--frozen-lockfile`.

4. **Keep `ffmpeg` available** — unchanged from before. Voice notes are still
   transcoded ogg→mp3, and a video is still reduced to frames + soundtrack for
   models that do not take video input. The Docker image already installs it;
   on bare metal `apk add ffmpeg` / `apt install ffmpeg`.

No data migration, no KeyDB changes: per-model spend buckets keep their keys
because the recorded model id is still the primary model you configured, not
whichever fallback answered.

## What changes in behaviour

- **Attribution headers — nothing to do.** `OPENROUTER_APP_URL` /
  `OPENROUTER_APP_TITLE` are read exactly as before. The title now goes out
  twice: as the legacy `X-Title` and as the SDK's `X-OpenRouter-Title`.
  `OPENROUTER_APP_URL` is still `HTTP-Referer`.

- **Explicit retry and timeout policy.** Requests time out after 180 s, and
  retries use exponential backoff (500 ms → 4 s, factor 2) with a total budget
  of 20 s, connection errors included. The SDK's own defaults are no timeout at
  all and a one-hour retry budget, which would hang an ask far past Telegram's
  typing window; both are overridden.

- **Cost is OpenRouter's number only.** Per-request USD cost is the figure
  OpenRouter reports, aggregated across the whole tool-calling loop. The local
  fallback that priced tokens from the model catalogue is deleted, so a model
  OpenRouter reports no cost for is now recorded as *unpriced* (spend
  under-counted) instead of being silently estimated. Expect the owner digest's
  "models with no cost reported" line and the spend tab's unpriced badges to
  reflect that new meaning; totals for such models read as a $0 floor.

- **Loop bound effectively unchanged.** One ask still makes at most 8 model
  calls (up to 7 tool-execution rounds plus one final tool-free turn) — with
  one exception: when that final turn comes back empty, the new library
  re-sends it once, so the worst case is 9. The old step cap was a hard 8. No
  final-answer directive is injected into the conversation, and a completed run
  that comes back empty is reported to the user as an AI error — and is still
  billed, as before.

- **Video is a first-class item.** Native clips ride on the Responses API's
  `input_video` item instead of a provider-specific escape hatch. The
  native-versus-frames gate is unchanged.

- **`GET /api/provider` is gone** from the admin HTTP API, together with the
  Mini App's capability probe. Nothing else in the API changed.
