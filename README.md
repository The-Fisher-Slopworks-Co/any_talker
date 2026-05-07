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

## Manual verification checklist (run on first deploy)

- [ ] `/start` from owner → menu button appears.
- [ ] `/ask hello` from owner → AI reply.
- [ ] `/ask Загадай число от 1 до 10` → AI calls `random_number` and replies with a number.
- [ ] Reply to bot's previous answer with `/ask follow-up question` → context retained.
- [ ] Non-whitelisted user in non-whitelisted chat → no reply.
- [ ] Add user/chat in admin Web App → they can use `/ask`.
- [ ] Remove user/chat → they can no longer use `/ask`.
- [ ] Set `capacity=100` and `ownerExempt=false`, fire `/ask` → bucket exhausts, replies with "Refilled in N min".
- [ ] Reset bucket via Web App → `/ask` works again.
- [ ] Switch model in Web App → next `/ask` uses the new model.
