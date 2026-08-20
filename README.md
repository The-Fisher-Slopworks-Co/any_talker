# any_talker

Telegram bot with AI integration via OpenRouter.

## Setup

1. Copy `.env.example` to `.env` and fill required vars:
   - `BOT_TOKEN` — from @BotFather
   - `OPENROUTER_API_KEY` — from https://openrouter.ai/keys
   - `BOT_OWNER_ID` — your Telegram user ID

   `OPENROUTER_BASE_URL` is optional and defaults to
   `https://openrouter.ai/api/v1`; set it only when a proxy or a self-hosted
   gateway fronts OpenRouter under its own hostname (include the version
   segment). Per-request USD cost is the figure OpenRouter reports for the whole
   tool-calling loop; a model it reports no cost for is flagged as
   under-counted rather than priced from a local table.

   The bot uses OpenRouter's model fallback chain, provider routing, service
   tiers, per-provider stats in the admin model picker, and sticky
   per-conversation routing so a chat keeps hitting the same provider's warm
   prompt cache.
2. Start KeyDB: `docker compose up -d`
3. `bun install`

> Voice notes require `ffmpeg` on the host (the Docker image installs it):
> Telegram ogg/opus is transcoded to mp3 before being sent. ffmpeg is also what
> reduces a video to frames + soundtrack on models that don't take video input;
> models that do get the clip whole and need no ffmpeg at all.

## Run

```bash
bun run dev      # long polling mode with hot reload
bun run start    # production mode (long polling)
bun test         # unit tests
bun run typecheck
```

## Production deploy

A ready-to-run Compose file is provided in `docker-compose.prod.yml`. It pulls
the bot image from GHCR (published by CI on every push to `main`), runs KeyDB
with persistence, fronts both with Caddy for automatic HTTPS (Let's Encrypt),
and bundles a small observability stack (VictoriaMetrics + VictoriaLogs +
Vector). On a fresh server with DNS pointed at it:

```bash
cp .env.example .env          # fill BOT_TOKEN, OPENROUTER_API_KEY,
                              # BOT_OWNER_ID, DOMAIN, LETSENCRYPT_EMAIL
cp Caddyfile.example Caddyfile
docker compose -f docker-compose.prod.yml up -d
```

Only Caddy exposes ports (80/443); everything else (bot, KeyDB,
VictoriaMetrics, VictoriaLogs, Vector) stays on an internal Docker network.

## Observability

The bot exposes Prometheus metrics on `GET /metrics` (port 8080, internal
network only — Caddy returns 404 if that path is requested publicly). The
production Compose runs:

- **VictoriaMetrics** (`victoriametrics/victoria-metrics`) — scrapes the
  bot's `/metrics` every 15s using `vmagent.yml`. Retention defaults to
  `VM_RETENTION=90d`.
- **VictoriaLogs** (`victoriametrics/victoria-logs`) — receives logs over
  the Elasticsearch bulk API. Retention defaults to `VL_RETENTION=30d`.
- **Vector** (`timberio/vector`) — tails Docker container logs (containers
  labelled `observability.collect=true`), parses the bot's JSON lines, and
  forwards them to VictoriaLogs.

Useful endpoints (from inside the compose network):

```bash
# Live metrics in Prometheus exposition format
docker compose -f docker-compose.prod.yml exec victoriametrics \
  wget -qO- http://bot:8080/metrics

# VictoriaMetrics query API (PromQL)
docker compose -f docker-compose.prod.yml exec victoriametrics \
  wget -qO- 'http://localhost:8428/api/v1/query?query=bot_ask_total'

# VictoriaLogs query API (LogsQL)
docker compose -f docker-compose.prod.yml exec victorialogs \
  wget -qO- --post-data='_msg:* AND container_name:*bot*' \
  http://localhost:9428/select/logsql/query
```

To browse the VictoriaMetrics/VictoriaLogs UIs from a laptop, set up an SSH
tunnel (e.g. `ssh -L 8428:victoriametrics:8428 -L 9428:victorialogs:9428
user@host`) — neither is exposed publicly by Caddy. The bot publishes the
following metric families:

| Metric | Type | Labels | Purpose |
|---|---|---|---|
| `bot_updates_total` | counter | `type` | Telegram updates received |
| `bot_commands_total` | counter | `command` | Bot commands seen (allowlisted) |
| `bot_ask_total` | counter | `source`, `outcome` | `/ask` and guest-mode outcomes |
| `bot_ask_duration_seconds` | histogram | `source`, `outcome` | End-to-end handler latency |
| `bot_ask_tokens_total` | counter | `source` | Tokens billed by the provider |
| `bot_ai_requests_total` | counter | `outcome` | AI endpoint call success/error |
| `bot_ai_request_duration_seconds` | histogram | `outcome` | AI endpoint call latency |
| `bot_tool_calls_total` | counter | `tool`, `outcome` | Tool invocations by the model |
| `bot_tool_call_duration_seconds` | histogram | `tool` | Tool execution latency |
| `bot_rate_limit_checks_total` | counter | `result` | Rate-limit allow/deny |
| `bot_rate_limit_tokens_deducted_total` | counter | — | Total tokens charged to usage windows |
| `bot_budget_denied_total` | counter | `reason` | Requests denied by a USD budget cap (global/chat/new-user) |
| `bot_reminders_delivered_total` | counter | `outcome` | Reminder scheduler results |
| `bot_checks_processed_total` | counter | `outcome` | Recurring-check fires/timeouts/answers |
| `bot_video_extractions_total` | counter | `outcome` | Video attachments turned into model input (native / frames / too long / too large / failed) |
| `http_requests_total` | counter | `method`, `route`, `status` | Web App / API traffic |
| `http_request_duration_seconds` | histogram | `method`, `route` | Web App / API latency |
| `process_uptime_seconds` | gauge | — | Process uptime |
| `process_resident_memory_bytes` | gauge | — | RSS |
| `process_heap_used_bytes` | gauge | — | V8 heap in use |
| `bot_build_info` | gauge | `version`, `bun` | Always 1, carries metadata |

## HTTP proxy

The bot honours the standard `HTTP_PROXY`, `HTTPS_PROXY`, and `NO_PROXY`
environment variables (lowercase variants are also recognised). They apply
to every outbound fetch: the Telegram Bot API (via grammY, which we route
through Bun's native `fetch`), the AI endpoint, the `fetch_page` / `search_web`
tools, and Telegram file downloads. `NO_PROXY` is a comma-separated list of
exact hostnames to bypass (`*` disables the proxy entirely; per-entry ports
are supported as `host:port`).

## Features

- `/ask <text>` — send to AI, optionally with reply context (walks the chain stored in KeyDB).
- Media understanding — attach the `/ask` as a caption on a **photo** (albums included), a **voice
  note**, a **video**, or a **GIF**, or reply with `/ask` to any of those (video notes included).
  Photos go to the model as-is; voice notes are transcoded to mp3. A **video is sent whole** as a
  native `input_video` item when the configured model accepts video input (Gemini & co — the bot
  reads that off OpenRouter's `/models` modalities), so the model sees real motion and hears the
  soundtrack; on a model without
  video input it falls back to a handful of evenly spaced frames plus the audio track. Clips longer
  than **60 seconds**, or above Telegram's 20 MB download ceiling, are refused with a note saying
  which limit was hit. The duration cap is a cost guard: native video is billed by clip length
  (Gemini charges ~260 tokens per second), so a few minutes of footage would swallow a user's whole
  token window in one ask.
- Tool calling — built-in `random_number` tool; add new tools via `registerTool()`. Each call and
  its result are stored with the turn and replayed on follow-ups as real `function_call` /
  `function_call_output` items, so "you missed someone" is answered from the page the bot fetched
  rather than from its own summary of it. Results are capped at 4096 chars (arguments are not —
  they are model output, already bounded); at most 8 calls per turn are kept.
- Reminders — ask the bot in chat to set one-shot reminders, list your pending ones, edit a
  reminder's note or time, or cancel them by description; the AI drives this via the
  `schedule_reminder_*` / `list_reminders` / `edit_reminder` / `cancel_reminder` tools. Each user
  is capped at `maxRemindersPerUser` reminders (default 50; configurable via `PUT /api/settings`).
- Personal settings via chat — ask the bot to read or change your own name, timezone, gender, or
  language in plain language ("call me Vasya", "I'm in Moscow time", "switch to Russian"); the AI
  drives this via the `get_user_settings` / `update_user_settings` tools (the same four fields the
  Web App exposes). Changes are confirmed with a blockquote and applied immediately — including to a
  reminder set in the same message (e.g. "set it for 15:00, Yekaterinburg time") — and are shared
  across the main bot and all character bots. The same settings are also editable in the Web App.
- Per-user dual-window rate limit: a rolling **5-hour** token budget and a **weekly** token budget
  (defaults: 30k / 300k). Limited only when *either* window is exhausted; each user's window resets
  are staggered (a deterministic per-user phase offset, in 10-minute steps). Configurable in admin UI.
- **`/usage`** (DM only) — any user can ask where they stand: per window, the share of that budget
  already spent and when it resets. The Web App shows the same two figures as progress
  bars in a header above every screen. Both surfaces are **percentage-only by construction** — they
  are built from a type that carries no token counts at all, so the raw budget figures stay on the
  owner-gated admin routes.
- **USD budget guard** — hard spend caps enforced independently of the token limit (money vs.
  volume): a global **monthly** cap (the kill-switch — sized to your real budget), a global **daily**
  cap, a **per-chat** daily cap, and a tighter **new-user** daily cap during a soft-start window. The
  owner is never blocked, but owner spend still counts. All caps are runtime-editable in the admin UI
  (**Budget caps** tab); disable enforcement with one toggle. Spend is tracked per user/chat/global/
  model — including reminder-delivery LLM re-runs, which now book cost too.
- **Budget observability** — a **Spend dashboard** (admin UI) with the global total, top spenders
  (users + chats), per-model breakdown (models OpenRouter reported no cost for are flagged, so the
  total reads as a floor), most-denied users, and new
  users/chats. Plus proactive owner DMs: instant alarms (global cap breached, bot added to a new
  group, a user/chat spend spike) and a periodic **budget digest** (interval + spike thresholds
  configurable). Alarms are deduped to once per period. The owner can also pull the digest at any
  time with **`/digest`** in a DM — it renders the same tables without disturbing the schedule.
- Whitelist (chats and users). Owner always bypasses it. Enforcement is a single toggle in the admin
  UI (**Whitelist** tab): turn it off to open the bot to everyone — the USD budget guard and rate
  limit stay in force as the safety net, and the whitelist entries are preserved (not consulted) so
  it can be turned back on unchanged.
- **User blacklist.** Blocked users are always denied — even while the whitelist is off, even in a
  whitelisted chat, and in guest mode — and their pending reminders are dropped instead of
  delivered. Only the owner is immune. Managed from the same admin tab (blocked-users list) and via
  "Add to blacklist" on a user's page.
- Admin Web App served by the bot's HTTP server; set the chat menu button via @BotFather to point at it.
- **Model settings** — the admin model picker validates ids against OpenRouter's model list and
  shows price, modalities, tool and prompt-caching support. It also offers a **fallback chain**,
  **provider routing** (sort by price/throughput/latency, or pin one provider with no fallback),
  **service tiers** (flex/priority) and the resolved provider's live price/throughput/latency —
  globally and per chat.
- **Guest mode** (Bot API 10.0) — bot can answer queries from chats it isn't a member of.
  Enable in @BotFather, then any whitelisted user (or owner) can invoke the bot via Telegram's
  guest-mode UI. Single-turn replies sent via `answerGuestQuery`; non-whitelisted guest
  invocations are silently ignored.
- **Rich Markdown replies** (Bot API 10.1) — AI answers are sent as rich messages via
  `sendRichMessage`, so the model can use the full Rich Markdown set (headings, lists, tables,
  blockquotes, code blocks, spoilers, strikethrough, footnotes, LaTeX, …). Long answers collapse
  into a `<details>` block; a plain-text `sendMessage` is used as a fallback if a rich send fails.

## License

AGPL-3.0-or-later. See [LICENSE](LICENSE).
