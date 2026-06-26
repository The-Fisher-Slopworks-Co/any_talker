## Project

Telegram bot with AI integration via an OpenAI-compatible API (grammY + Bun + KeyDB).
See `README.md` for setup, running, deployment, observability, and the
user-facing feature/metrics catalog. This file covers how to work in the code.

### Architecture

**`docs/ARCHITECTURE.md` is the source of truth for system structure** — the
component map, runtime/data flow, data model, and key design decisions. **Read it
before any work that touches the architecture, adds or removes a module, or
crosses a component boundary.**

Keep the two in sync: when a change alters the architecture — a new/removed/
renamed module or service, a changed data or control flow, a new external
integration, a new cross-cutting pattern, or a moved boundary — **update
`docs/ARCHITECTURE.md` in the same change** so the doc never drifts from the code.

Keep this file pointing to `docs/ARCHITECTURE.md` rather than duplicating it;
the doc is the single source of truth for structure.

### Commands

```bash
bun run dev        # long-polling + hot reload (src/main.ts)
bun run check      # typecheck + tests — run before every commit
bun run typecheck  # bunx tsc --noEmit
bun test           # tests (co-located *.test.ts)
```

### Layout (`src/`)

- `main.ts` — composition root: loads config, wires storage/ai/rateLimiter, registers tools, starts bot + HTTP server + schedulers.
- `bot/` — grammY bot, handlers (`handlers/ask.ts`, `guest.ts`, …), middleware, Telegram formatting.
- `ai/` — OpenAI-compatible client (`compat-client.ts`), model catalogue + pricing (`model-catalog.ts`), instruction builder, and `tools/` (registry + each tool).
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
- **Adding an AI tool:** define a `Tool` (Zod `parameters`, `execute(input, ctx)`), then `registerTool(withLogging(tool))` in `main.ts`. See `src/ai/tools/registry.ts`.
- **Tests:** `bun test`, co-located as `*.test.ts`; use `MemoryStorage` instead of KeyDB.

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
