# Telegram AI Bot — Design Spec

**Date:** 2026-05-07
**Status:** Approved for plan

## Goal

Build a Telegram bot with a single user-facing command `/ask` that proxies messages to an AI provider via Vercel AI SDK + OpenRouter, with reply-chain conversation memory, per-user token-bucket rate limiting, chat/user whitelist, and an admin-only Telegram Mini App for editing settings (prompt, model, rate limit, whitelist).

## Tech stack

- **Runtime:** Bun
- **Telegram:** grammY
- **AI:** `ai` (Vercel AI SDK) + `@openrouter/ai-sdk-provider`
- **Storage:** KeyDB via `Bun.redis`, behind a `Storage` interface so it can be swapped
- **HTTP server:** `Bun.serve` (handles webhook, Web App static, REST API)
- **Web App UI:** React + Tailwind via Bun HTML imports
- **Tests:** `bun test`

## Module layout

```
src/
  config.ts                 # env → typed Config
  main.ts                   # entry point: wires everything
  shared/
    types.ts                # domain types (Settings, WhitelistEntry, ConversationNode, ...)
  storage/
    types.ts                # Storage interface
    keydb.ts                # KeyDB adapter (Bun.redis)
    memory.ts               # in-memory adapter for tests
  ratelimit/
    types.ts                # RateLimiter interface
    token-bucket.ts         # token bucket with lazy refill, persists via Storage
  ai/
    types.ts                # AIClient interface
    openrouter.ts           # Vercel AI SDK + OpenRouter implementation
    tools/
      registry.ts           # Tool interface, registerTool, getAllTools
      random-number.ts      # starter tool
  bot/
    index.ts                # grammY setup
    handlers/
      ask.ts                # /ask handler — orchestrates everything
      start.ts              # /start — for owner, sets menu button
    middleware/
      whitelist.ts          # whitelist gating (owner bypasses gate)
      logger.ts             # request logging
    context-builder.ts      # walks reply chain, builds AI messages
  webapp/
    server.ts               # Bun.serve routes
    auth.ts                 # Telegram initData HMAC verification
    api/
      settings.ts           # GET/PUT /api/settings
      whitelist.ts          # GET/POST/DELETE /api/whitelist/{users,chats}
      ratelimit.ts          # GET/PUT /api/ratelimit/me
    ui/
      index.html
      app.tsx               # React SPA, four tabs
```

**Boundaries:**
- `bot/`, `webapp/` depend on `Storage` / `RateLimiter` / `AIClient` interfaces only — no `Bun.redis` or `ai` SDK imports.
- `ai/` receives `Tool[]` via parameter; doesn't know about grammY.
- `main.ts` is the only place where concrete implementations get instantiated and wired together.

## Data model (KeyDB keys)

Single KeyDB instance; all keys namespaced with prefix `at:` (any_talker).

| Key | Type | Value |
|---|---|---|
| `at:settings` | Hash/JSON | `{ systemPrompt, model, rateLimit: { capacity, refillAmount, refillIntervalMs, ownerExempt } }` |
| `at:whitelist:users` | Set | user IDs (strings) |
| `at:whitelist:chats` | Set | chat IDs (strings) |
| `at:bucket:{userId}` | JSON | `{ tokens: number, lastRefillTs: number }` |
| `at:msg:{chatId}:{botMsgId}` | JSON, TTL 30d | `{ userQuestion, botAnswer, parentBotMsgId \| null, ts }` |
| `at:meta:{chatId}:{botMsgId}` | (same record above; one-key model) | — |

Defaults applied on first read if `at:settings` is missing:
- `model = "anthropic/claude-sonnet-4-5"`
- `systemPrompt = "You are a helpful assistant in a Telegram chat. Be concise."`
- `rateLimit = { capacity: 30000, refillAmount: 3000, refillIntervalMs: 2_400_000, ownerExempt: true }`

## `/ask` flow

1. **Whitelist gate** (middleware). `userId === BOT_OWNER_ID` always passes. Otherwise, request passes if `userId ∈ whitelist:users` OR `chatId ∈ whitelist:chats`. On fail: silent (no reply).
2. **Parse:** strip `/ask` (and optional `@botname`), keep the rest as the user prompt. If empty and no reply target → reply with usage hint.
3. **Build context** (`bot/context-builder.ts`):
   - Start with `systemPrompt`.
   - If `/ask` is a reply, look up `at:msg:{chatId}:{replyToMsgId}`:
     - **Found** → it was a previous bot answer. Walk via `parentBotMsgId` chain (max depth `MAX_REPLY_CHAIN_DEPTH = 20`). Reverse to chronological order; for each node push `{role: "user", content: userQuestion}` then `{role: "assistant", content: botAnswer}`.
     - **Not found** → reply target is some other message (or storage TTL expired). Push a single context message before the current one: `{role: "user", content: "Context (replied message from <first_name or 'unknown'>): <reply_text>"}`. If the reply target has no text (sticker/photo/etc.), use `<media>` placeholder.
   - Push current `{role: "user", content: <user prompt>}`.
4. **Rate limit** (skip if owner AND `ownerExempt`):
   - Lazy refill: `refill = floor((now - lastRefillTs) / refillIntervalMs) * refillAmount`, capped at `capacity`. If `refill > 0`, set `tokens = min(capacity, tokens + refill)` and `lastRefillTs += periods * refillIntervalMs`.
   - If `tokens <= 0` → reply with `"Rate limit exceeded. Restored in N min."`. Compute N from time-to-next-refill.
5. **AI call** via `AIClient.ask(messages, tools)` → uses Vercel AI SDK `generateText` with `tools`, `maxSteps: 5`, `model: openrouter(settings.model)`.
6. **Send reply** via Telegram. Capture returned `messageId`.
7. **Persist** node to `at:msg:{chatId}:{botMsgId}` with `parentBotMsgId = replyToMsgId if found else null`.
8. **Deduct** tokens: `tokens -= response.usage.totalTokens`. Save bucket. If goes negative, that's fine — request was in-flight; future requests blocked until refill.

Errors:
- AI throws → reply `"⚠️ AI error. Try again later."` Log full error.
- Tool throws → AI sees the thrown message as tool result and recovers naturally (Vercel SDK default).

## Tools

`Tool` interface (compatible with Vercel AI SDK `tool()` helper):
```ts
type Tool = {
  name: string;
  description: string;
  parameters: ZodSchema;
  execute: (args, ctx) => Promise<unknown>;
};
```

`registry.ts` exports `registerTool(tool)` and `getAllTools(): Tool[]`. `ai/openrouter.ts` calls `getAllTools()` and converts to the SDK's tool map.

Initial registrations (in `main.ts`):
- `random_number({ min, max })` → returns integer in `[min, max]`.

Adding new tools is a one-line `registerTool(myTool)` call.

## Web App

**Auth:**
- Browser sends every API call with header `Authorization: tma <initData>`.
- `webapp/auth.ts` middleware:
  1. Parse `initData` URL-encoded params.
  2. Verify HMAC-SHA256 per Telegram spec (`secret_key = HMAC_SHA256("WebAppData", BOT_TOKEN)`, then `sign = HMAC_SHA256(secret_key, data_check_string)`).
  3. Reject if hash mismatch or `auth_date` older than 24h.
  4. Parse `user` JSON; require `user.id === BOT_OWNER_ID`. Reject otherwise.
- All `/api/*` endpoints sit behind this middleware.

**UI (React SPA, four tabs):**

1. **Prompt** — textarea (system prompt) + Save button. GET/PUT `/api/settings` (just the prompt field).
2. **Model** — text input (`anthropic/claude-sonnet-4-5` etc.) + Save. Same endpoint, different field.
3. **Rate Limit** — number inputs: capacity, refill amount, refill interval (minutes, converted to ms server-side), checkbox "Owner exempt". GET/PUT `/api/settings.rateLimit`. Plus a separate "My bucket" panel showing the owner's current `tokens` / `lastRefillTs` from `at:bucket:{ownerId}` with a Reset button (`PUT /api/ratelimit/me { tokens: capacity }`).
4. **Whitelist** — two lists side by side, Users and Chats. Each row: ID + optional label + Remove button. Form to add new ID with optional label. Endpoints: `GET /api/whitelist`, `POST /api/whitelist/{users|chats} { id, label }`, `DELETE /api/whitelist/{users|chats}/{id}`.

**Opening the Web App:**
- On bot startup, no proactive setup is done.
- When owner sends `/start` to the bot, handler sets the chat menu button via `setChatMenuButton({ chat_id: ownerId, menu_button: { type: "web_app", text: "Admin", web_app: { url: WEBAPP_URL } } })`. Bot replies "Admin panel button installed. Tap the menu button to the left of the message input."
- Non-owner `/start` → ignored or generic reply.

## Configuration

Env vars (loaded by Bun automatically from `.env`):

| Var | Required | Purpose |
|---|---|---|
| `BOT_TOKEN` | yes | Telegram bot token |
| `OPENROUTER_API_KEY` | yes | OpenRouter API key |
| `BOT_OWNER_ID` | yes | Owner's Telegram user ID (numeric) |
| `WEBAPP_URL` | yes | HTTPS URL where Web App is served |
| `WEBHOOK_URL` | no | If set → webhook mode; else long polling |
| `KEYDB_URL` | no | Default `redis://localhost:6379` |
| `PORT` | no | Default `3000` |

Production: bot deployed behind reverse proxy (Caddy) handling HTTPS; `WEBAPP_URL` and `WEBHOOK_URL` point at the same host. Dev: long polling, Web App optionally exposed via cloudflared tunnel.

## Testing strategy

- **Unit tests** (`bun test`) using `storage/memory.ts`:
  - `ratelimit/token-bucket.ts` — refill math, deduct, exhaustion, owner-exempt path.
  - `bot/context-builder.ts` — reply chain walk: linear chain, broken chain (missing node), depth cap, no reply target, reply to non-bot message.
  - `ai/tools/random-number.ts` — bounds.
  - `webapp/auth.ts` — initData verification with known-good fixture, bad hash, expired auth_date, non-owner user.
  - `storage/memory.ts` — basic CRUD.
- **Manual integration test** checklist for first run (in plan):
  - `/start` from owner → menu button appears.
  - `/ask hello` from owner → AI replies.
  - `/ask Загадай число от 1 до 10` → AI calls tool, returns number in reply.
  - Reply to bot's previous answer with `/ask <follow-up>` → context retained.
  - Non-whitelisted user in non-whitelisted chat → no reply.
  - Web App opens, all four tabs save and reload correctly.
  - Set rate limit very low (e.g. capacity 100) → `/ask` exhausts bucket, gets refused with restore-in-N-min message.

## Out of scope

- Streaming AI responses to Telegram (could be added later via message edits).
- Multiple bot owners.
- Per-chat or per-user system prompts.
- Provider switching beyond OpenRouter's catalog.
- Image/voice input.
- Conversation memory beyond reply chains (no implicit "remember last N messages").
