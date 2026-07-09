# any_talker

Telegram bot with AI integration via any OpenAI-compatible API.

## Setup

1. Copy `.env.example` to `.env` and fill required vars:
   - `BOT_TOKEN` — from @BotFather
   - `OPENAI_API_KEY` — API key for your chosen endpoint
   - `OPENAI_BASE_URL` — any OpenAI-compatible chat-completions endpoint,
     including the version segment (e.g. `https://api.openai.com/v1`, or a
     self-hosted gateway like LiteLLM / vLLM). Per-request USD cost is computed
     from the pricing this endpoint's `GET /v1/models` returns (0 if it
     returns none). See [`docs/ai-provider.md`](docs/ai-provider.md).
   - `BOT_OWNER_ID` — your Telegram user ID
2. Start KeyDB: `docker compose up -d`
3. `bun install`

> Voice-note understanding requires `ffmpeg` on the host (the Docker image
> installs it): Telegram ogg/opus is transcoded to mp3 before being sent.

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
cp .env.example .env          # fill BOT_TOKEN, OPENAI_API_KEY, OPENAI_BASE_URL,
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
- Tool calling — built-in `random_number` tool; add new tools via `registerTool()`.
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
- **USD budget guard** — hard spend caps enforced independently of the token limit (money vs.
  volume): a global **monthly** cap (the kill-switch — sized to your real budget), a global **daily**
  cap, a **per-chat** daily cap, and a tighter **new-user** daily cap during a soft-start window. The
  owner is never blocked, but owner spend still counts. All caps are runtime-editable in the admin UI
  (**Budget caps** tab); disable enforcement with one toggle. Spend is tracked per user/chat/global/
  model — including reminder-delivery LLM re-runs, which now book cost too.
- **Budget observability** — a **Spend dashboard** (admin UI) with the global total, top spenders
  (users + chats), per-model breakdown (unpriced models flagged), most-denied users, and new
  users/chats. Plus proactive owner DMs: instant alarms (global cap breached, bot added to a new
  group, a user/chat spend spike) and a periodic **budget digest** (interval + spike thresholds
  configurable). Alarms are deduped to once per period.
- Whitelist (chats and users). Owner always bypasses it. Enforcement is a single toggle in the admin
  UI (**Whitelist** tab): turn it off to open the bot to everyone — the USD budget guard and rate
  limit stay in force as the safety net, and the whitelist entries are preserved (not consulted) so
  it can be turned back on unchanged.
- Admin Web App served by the bot's HTTP server; set the chat menu button via @BotFather to point at it.
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
