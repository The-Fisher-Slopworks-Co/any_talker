# any_talker

A Telegram bot that answers `/ask` with any model on [OpenRouter](https://openrouter.ai), with an admin Web App to run it.

## Run it

Needs [Bun](https://bun.sh), Docker, and [uv](https://docs.astral.sh/uv/) for `bun run check`.

```bash
cp .env.example .env   # BOT_TOKEN, OPENROUTER_API_KEY, BOT_OWNER_ID
docker compose up -d   # KeyDB
bun install
bun run dev
```

To work on the Web App without Telegram, run `bun run webapp:demo` and open <http://localhost:3000/webapp>.

## License

[AGPL-3.0-or-later](LICENSE)
