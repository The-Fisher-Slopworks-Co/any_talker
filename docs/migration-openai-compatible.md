<!--
SPDX-License-Identifier: AGPL-3.0-or-later
Copyright (C) 2026 The Fisher Slopworks Co
-->

# Migration: OpenRouter → OpenAI-compatible API

What you **must** do to deploy this release:

1. **Update `.env`** (gitignored, not changed for you). Remove
   `OPENROUTER_API_KEY` / `OPENROUTER_APP_URL` / `OPENROUTER_APP_TITLE`, add:
   ```dotenv
   OPENAI_API_KEY=<your key>
   OPENAI_BASE_URL=https://api.openai.com/v1   # any OpenAI-compatible endpoint, incl. /v1
   ```
   Both are required — the bot won't boot without them.

2. **`bun install`** — the AI provider dependency changed.

3. **Ensure `ffmpeg` is available** (voice notes are transcoded ogg→mp3).
   Docker image already installs it; on bare metal `apk add ffmpeg` / `apt install ffmpeg`.

That's it — no data migration. If anyone relied on **BYOK** for access (it was
removed), whitelist them instead.
