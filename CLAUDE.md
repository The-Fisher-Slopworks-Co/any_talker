## Project

Telegram bot with AI integration via OpenRouter (grammY + Bun + KeyDB).
See `README.md` for setup, running, deployment, observability, and the
user-facing feature/metrics catalog. This file covers how to work in the code.

### Commands

```bash
bun run dev        # long-polling + hot reload (src/main.ts)
bun run check      # typecheck + lint + format + knip + tests — before every commit
bun run typecheck  # bunx tsc --noEmit
bun run lint       # oxlint (config: .oxlintrc.json)
bun run format     # prettier --write over src/ (config: .prettierrc.json)
bun run knip       # unused files/exports/deps (config: knip.ts)
bun test           # tests (co-located *.test.ts)
```

`bun install` installs a lefthook pre-commit hook that runs the same gate
(`lefthook.yml`, ~3s). `LEFTHOOK=0 git commit` skips it for one commit.

### Layout (`src/`)

- `main.ts` — composition root: loads config, wires storage/ai/rateLimiter, registers tools, starts bot + HTTP server + schedulers.
- `bot/` — grammY bot, handlers (`handlers/ask.ts`, `guest.ts`, …), middleware, Telegram formatting.
- `ai/` — OpenRouter client (`openrouter-client.ts`) and its message mapper (`responses-input.ts`), model catalogue (`model-catalog.ts`), instruction builder, and `tools/` (registry + each tool).
- `storage/` — `Storage` interface (`types.ts`); `KeyDBStorage` (prod) and `MemoryStorage` (`memory.ts`, used by tests).
- `webapp/` — admin Web App: HTTP API (`api.ts`, `auth.ts`) + React UI (`ui/`).
- `reminders/`, `checks/`, `ratelimit/`, `spending/`, `metrics/`, `shared/` — supporting subsystems.

### Conventions

- **SPDX header on every new source file** (enforced via `REUSE.toml`; all current files comply):
  ```ts
  // SPDX-License-Identifier: AGPL-3.0-or-later
  // Copyright (C) 2026 The Fisher Slopworks Co
  ```
- **i18n:** languages are `en` | `ru`. Never hardcode user-facing strings — add keys to `src/shared/i18n.ts` and use `ctx.t` in handlers.
- **Dependency injection:** `createBot(deps)` / `startServer(deps)` take injected `storage`, `ai`, `rateLimiter`. Keep handlers as pure functions for testability.
- **Tagged outcomes:** handlers return `{ kind: "answered" | "denied" | "rateLimited" | "error" | ... }` objects the dispatcher switches on, rather than sending replies themselves.
- **Adding an AI tool:** define a `Tool` (Zod `parameters` — must be a `z.object(...)`, `execute(input, ctx)`), then `registerTool(withLogging(tool))` in `main.ts`. See `src/ai/tools/registry.ts`.
- **Tests:** `bun test`, co-located as `*.test.ts`; use `MemoryStorage` instead of KeyDB.

### Definition of done

- **Never commit to main.** Every task starts on a fresh branch off `origin/main`, named `<type>/<short-task>` — `fix/`, `feat/`, `refactor/`, `chore/`.
- **One task = one branch = one PR.** Past ~300 changed lines, split it into several PRs. `pr-size.yml` labels every PR `size:XS`…`size:XXL` from additions + deletions minus tests, `bun.lock` and generated files; **`size:XL` or `size:XXL` means split the PR**, not "explain why it is large".
- **PR title is the squash commit subject:** conventional commit with a scope, enforced by `.github/workflows/pr-title.yml`.
  - Type: `feat` `fix` `refactor` `chore` `docs` `test` `ci` `perf` `revert`.
  - Scope (required): a top-level `src/` module — `ai` `bot` `budget` `checks` `managed-bots` `metrics` `observability` `ratelimit` `reminders` `shared` `spending` `storage` `types` `webapp` — or `deps` `github` `release` `docker`. A new module means adding it to the `scopes:` list in that workflow.
  - Subject: lowercase start, imperative, no trailing period.
  - The body follows `.github/pull_request_template.md`.
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

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend (Web App)

The admin Web App (`src/webapp/ui/`) is React + Tailwind, bundled by Bun (no
vite/webpack — HTML imports + `bun-plugin-tailwind`). For the underlying Bun
HTML-import/`Bun.serve` API, see `node_modules/bun-types/docs/**.mdx`.
