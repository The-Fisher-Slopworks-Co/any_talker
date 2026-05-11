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
bun run dev      # long polling mode (default)
bun run start    # production mode (uses WEBHOOK_URL if set)
bun test         # unit tests
bun run typecheck
```

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
