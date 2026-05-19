# any_talker

Telegram bot with AI integration via OpenRouter.

## Setup

1. Copy `.env.example` to `.env` and fill required vars:
   - `BOT_TOKEN` — from @BotFather
   - `OPENROUTER_API_KEY` — from openrouter.ai
   - `BOT_OWNER_ID` — your Telegram user ID
   - `WEBAPP_URL` — public HTTPS URL where the admin Web App is served (e.g. https://bot.example.com/)
2. Start KeyDB: `docker compose up -d`
3. `bun install`

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
cp .env.example .env          # fill BOT_TOKEN, OPENROUTER_API_KEY, BOT_OWNER_ID,
                              # DOMAIN, LETSENCRYPT_EMAIL, and set
                              # WEBAPP_URL=https://<DOMAIN>
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
| `bot_ai_requests_total` | counter | `outcome` | OpenRouter call success/error |
| `bot_ai_request_duration_seconds` | histogram | `outcome` | OpenRouter call latency |
| `bot_tool_calls_total` | counter | `tool`, `outcome` | Tool invocations by the model |
| `bot_tool_call_duration_seconds` | histogram | `tool` | Tool execution latency |
| `bot_rate_limit_checks_total` | counter | `result` | Token-bucket allow/deny |
| `bot_rate_limit_tokens_deducted_total` | counter | — | Total tokens charged to buckets |
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
through Bun's native `fetch`), OpenRouter, the `fetch_page` / `search_web`
tools, and Telegram file downloads. `NO_PROXY` is a comma-separated list of
exact hostnames to bypass (`*` disables the proxy entirely; per-entry ports
are supported as `host:port`).

## Features

- `/ask <text>` — send to AI, optionally with reply context (walks the chain stored in KeyDB).
- Tool calling — built-in `random_number` tool; add new tools via `registerTool()`.
- Per-user token-bucket rate limit (defaults: 30k capacity, +3k every 40 min). Configurable in admin UI.
- Whitelist (chats and users). Owner bypasses whitelist.
- Admin Web App opens via the chat menu button after `/start`.
- **Guest mode** (Bot API 10.0) — bot can answer queries from chats it isn't a member of.
  Enable in @BotFather, then any whitelisted user (or owner) can invoke the bot via Telegram's
  guest-mode UI. Single-turn replies sent via `answerGuestQuery`; non-whitelisted guest
  invocations are silently ignored.
