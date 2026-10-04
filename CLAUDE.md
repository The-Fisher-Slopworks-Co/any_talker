## Project

Telegram bot with AI integration via OpenRouter (grammY + Bun + KeyDB).
See `README.md` for setup and running. This file covers how to work in the code.

### Commands

```bash
bun run dev        # long-polling + hot reload (src/main.ts)
bun run check      # typecheck + lint + format + knip + reuse + tests — before every commit
bun run typecheck  # bunx tsc --noEmit
bun run lint       # oxlint (config: .oxlintrc.json)
bun run format     # prettier --write over src/ (config: .prettierrc.json)
bun run knip       # unused files/exports/deps (config: knip.ts)
bun run reuse      # `uvx reuse lint` — SPDX headers; needs uv on the machine
bun run test       # unit tests = `bun test src`; one file: `bun test src/path/x.test.ts`
bun run webapp:demo  # Web App in a plain browser on in-memory data: localhost:3000/webapp
```

For a webapp change, open it with `bun run webapp:demo` (`--as user`,
`--lang ru`, `--port N`) — no Telegram, KeyDB or `.env` needed — and put
screenshots of the affected screens in the PR's "UI changes" section.

Screenshots never go into git. Once the PR exists, upload them to a pre-release
named after it and link the assets from the body (`gh pr edit N --body-file`):

```bash
gh release create pr-N-evidence --prerelease --title "PR #N evidence" --notes "Screenshots for #N" before.png after.png
gh release upload pr-N-evidence after.png --clobber   # add or replace later
# ![after](https://github.com/The-Fisher-Slopworks-Co/any_talker/releases/download/pr-N-evidence/after.png)
```

No workflow reacts to releases or tags. After the PR merges the release can go:
`gh release delete pr-N-evidence --cleanup-tag --yes`.

`bun install` installs a lefthook pre-commit hook that runs the same gate
(`lefthook.yml`, ~3s). `LEFTHOOK=0 git commit` skips it for one commit.

### Layout (`src/`)

- `main.ts` — composition root: loads config, wires storage/ai/rateLimiter, registers tools, starts bot + HTTP server + schedulers.
- `config.ts` (env), `settings.ts` (stored runtime settings, validated against defaults), `proxy.ts` (proxy-aware `fetch` for grammY) — top-level wiring helpers.
- `bot/` — grammY bot: `handlers/` (pure, return tagged outcomes), `dispatch/` (switches on them and replies), `listeners/`, `middleware/`, Telegram formatting.
- `ai/` — OpenRouter client (`openrouter-client.ts`) and its message mapper (`responses-input.ts`), model catalogue (`model-catalog.ts`), instruction builder, and `tools/` (registry + each tool).
- `storage/` — `Storage` interface (`types.ts`); `KeyDBStorage` (`keydb.ts`, prod) and `MemoryStorage` (`memory.ts`, tests). Each is a facade over per-domain files in `types/`, `keydb/`, `memory/` — a new storage method touches all three.
- `webapp/` — admin Web App: HTTP API (`api.ts`, `auth.ts`) + React UI (`ui/`).
- `managed-bots/` — user-created child bots (manager, polling supervisor, persona).
- `budget/`, `spending/`, `ratelimit/` — spend guard, spend accounting, rate limits.
- `observability/` — digest + spike alerts.
- `reminders/`, `checks/`, `shared/` (i18n, shared types, tz), `types/` (ambient `.d.ts`) — supporting subsystems.

### Conventions

- **SPDX header on every new file** that can hold a comment — `bun run reuse` fails without one. `REUSE.toml` covers only the formats that cannot (JSON, `bun.lock`, Markdown, images); `#`-comment files use the same two lines with `#`:
  ```ts
  // SPDX-License-Identifier: AGPL-3.0-or-later
  // Copyright (C) 2026 The Fisher Slopworks Co
  ```
- **i18n:** languages are `en` | `ru`. Never hardcode user-facing strings — add keys to the matching domain file in `src/shared/i18n/` and use `ctx.t` in handlers.
- **Dependency injection:** `createBot(deps)` / `startServer(deps)` take injected `storage`, `ai`, `rateLimiter`. Keep handlers as pure functions for testability.
- **Tagged outcomes:** handlers return `{ kind: "answered" | "denied" | "rateLimited" | "error" | ... }` objects the dispatcher switches on, rather than sending replies themselves.
- **Adding an AI tool:** define a `Tool` (Zod `parameters` — must be a `z.object(...)`, `execute(input, ctx)`), then `registerTool(withLogging(tool))` in `main.ts`. See `src/ai/tools/registry.ts`.
- **Tests:** `bun test`, co-located as `*.test.ts`; use `MemoryStorage` instead of KeyDB.

### Definition of done

- **Issues and pull requests are written in English** — title and body, whatever language the task was discussed in.
- **Never commit to main.** Every task starts on a fresh branch off `origin/main`, named `<type>/<short-task>` — `fix/`, `feat/`, `refactor/`, `chore/`.
- **One task = one branch = one PR.** Past ~300 changed lines, split it into several PRs. `pr-size.yml` labels every PR `size:XS`…`size:XXL` from additions + deletions minus tests, `bun.lock` and generated files; **`size:XL` or `size:XXL` means split the PR**, not "explain why it is large".
- **PR title is the squash commit subject:** conventional commit with a scope, enforced by `.github/workflows/pr-title.yml`.
  - Type: `feat` `fix` `refactor` `chore` `docs` `test` `ci` `perf` `revert`.
  - Scope (required): a top-level `src/` module — `ai` `bot` `budget` `checks` `managed-bots` `observability` `ratelimit` `reminders` `shared` `spending` `storage` `types` `webapp` — or `deps` `github` `release` `docker`. A new module means adding it to the `scopes:` list in that workflow.
  - Subject: lowercase start, imperative, no trailing period.
  - The body follows `.github/pull_request_template.md`.
  - The body describes this PR alone. No links to the other PRs of a stack, no "this is the first/second/third PR", no "the next PR will…": GitHub already shows the base branch and the PRs stacked on it.
- **No AI attribution.** No `Assisted-by:` / `Co-Authored-By: <LLM>` trailers in commits and no "Generated with …" lines in PR bodies — it's just free advertising for the LLM's provider. The PR body becomes the squash commit body on main, so `.github/workflows/pr-title.yml` fails a PR that carries one.
- **Before opening:** `bun run check` green, then `gh pr create --fill`; report the PR URL as the final step of the task.
- **Never merge locally.** Merging happens on GitHub, squash only.

## Bun

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Frontend (Web App)

The admin Web App (`src/webapp/ui/`) is React + Tailwind, bundled by Bun (no
vite/webpack — HTML imports + `bun-plugin-tailwind`). For the underlying Bun
HTML-import/`Bun.serve` API, see `node_modules/bun-types/docs/**.mdx`.
