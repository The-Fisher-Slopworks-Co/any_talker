# Contributing to any_talker

Thanks for your interest in contributing! `any_talker` is a Telegram bot with
AI integration via OpenRouter, built with [Bun](https://bun.sh) and
[grammY](https://grammy.dev).

## Getting started

Prerequisites: [Bun](https://bun.sh) and Docker (for KeyDB).

```bash
git clone git@github.com:The-Fisher-Slopworks-Co/any_talker.git
cd any_talker
bun install
cp .env.example .env       # fill BOT_TOKEN, OPENROUTER_API_KEY, BOT_OWNER_ID
docker compose up -d       # start KeyDB
bun run dev                # long polling with hot reload
```

See [`README.md`](README.md) for the full setup and deployment details.

## Before you open a pull request

Run the full check suite and make sure it passes:

```bash
bun run check              # typecheck + tests (bun run typecheck && bun test)
```

- Keep changes focused — one logical change per pull request.
- Match the style and patterns of the surrounding code. TypeScript is checked
  with `bunx tsc --noEmit`; there are no `any`-escapes to lean on.
- Add or update tests (`bun test`) for behavior you change.

## Commit messages

This project follows [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(webapp): let admins pin a specific OpenRouter provider
fix(webapp): populate provider picker for all models
docs: add root LICENSE file so GitHub detects AGPL-3.0
```

Use a type (`feat`, `fix`, `docs`, `chore`, `refactor`, `test`, …) and an
optional scope describing the affected area.

## Licensing & REUSE

This repository is licensed under **AGPL-3.0-or-later** and follows the
[REUSE](https://reuse.software/) specification. By submitting a contribution
you agree that it is licensed under AGPL-3.0-or-later.

Every file must carry copyright and license information. Follow the existing
convention:

- **Source files** (`.ts`, etc.) start with a two-line SPDX header, matching
  every other file in `src/`:

  ```ts
  // SPDX-License-Identifier: AGPL-3.0-or-later
  // Copyright (C) 2026 The Fisher Slopworks Co
  ```

- **Docs and config files** (Markdown, JSON, YAML, Dockerfile, …) carry no
  header and rely on the repo-wide rule in [`REUSE.toml`](REUSE.toml), which
  covers everything via its `path = "**"` annotation.

If you add a file that needs a different license, add its text under
`LICENSES/` and a matching annotation. Verify compliance with:

```bash
reuse lint
```

## Reporting bugs & requesting features

Open an issue describing the problem (steps to reproduce, expected vs. actual
behavior) or the feature you'd like. For **security vulnerabilities**, do not
open a public issue — follow [`SECURITY.md`](SECURITY.md) instead.

## Code of conduct

By participating you agree to abide by our
[Code of Conduct](CODE_OF_CONDUCT.md).
