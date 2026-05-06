# Telegram AI Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Telegram bot with `/ask` (AI proxy via OpenRouter), reply-chain memory, per-user token-bucket rate limit, chat/user whitelist, and an admin-only Telegram Mini App for editing prompt/model/rate-limit/whitelist.

**Architecture:** Single Bun process. Modular layout under `src/` with `Storage`, `RateLimiter`, `AIClient` interfaces so concrete implementations (KeyDB, Vercel AI SDK + OpenRouter) are swappable. `Bun.serve` hosts both the Telegram webhook and the Web App (static SPA + REST API).

**Tech Stack:** Bun, grammY, Vercel AI SDK (`ai`) + `@openrouter/ai-sdk-provider`, `Bun.redis` (KeyDB), Zod, React + Tailwind v4 (`bun-plugin-tailwind`).

**Spec:** `docs/superpowers/specs/2026-05-07-telegram-ai-bot-design.md`

---

## Conventions

- Tests live next to the code they cover: `src/foo/bar.ts` ↔ `src/foo/bar.test.ts`. Run with `bun test`.
- Commits use conventional prefixes (`feat:`, `test:`, `chore:`, `refactor:`).
- Every Storage / RateLimiter / AIClient consumer takes the dependency via constructor argument or factory parameter — no module-level singletons.
- Test-only mocks live in `src/<module>/<module>.mock.ts` if needed.
- KeyDB key prefix: `at:` (for `any_talker`).

---

## Task 1: Project setup — install dependencies and tooling

**Files:**
- Modify: `package.json`
- Create: `.env.example`
- Create: `bunfig.toml`
- Modify: `.gitignore`
- Modify: `index.ts` (will be replaced by `src/main.ts` later — leave for now)

- [ ] **Step 1: Install runtime dependencies**

Run:
```bash
bun add grammy ai @openrouter/ai-sdk-provider zod react react-dom
```

- [ ] **Step 2: Install dev dependencies**

Run:
```bash
bun add -d @types/react @types/react-dom bun-plugin-tailwind tailwindcss
```

- [ ] **Step 3: Add scripts to package.json**

Open `package.json` and replace the `scripts` field (or add it):
```json
{
  "name": "any_talker",
  "module": "src/main.ts",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "bun --hot ./src/main.ts",
    "start": "bun ./src/main.ts",
    "test": "bun test",
    "typecheck": "bunx tsc --noEmit"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "@types/react": "latest",
    "@types/react-dom": "latest",
    "bun-plugin-tailwind": "latest",
    "tailwindcss": "latest"
  },
  "peerDependencies": {
    "typescript": "^5"
  },
  "dependencies": {
    "grammy": "latest",
    "ai": "latest",
    "@openrouter/ai-sdk-provider": "latest",
    "zod": "latest",
    "react": "latest",
    "react-dom": "latest"
  }
}
```

- [ ] **Step 4: Create bunfig.toml so HTML imports use Tailwind**

Create `bunfig.toml`:
```toml
[serve.static]
plugins = ["bun-plugin-tailwind"]
```

- [ ] **Step 5: Create .env.example**

Create `.env.example`:
```dotenv
# Required
BOT_TOKEN=
OPENROUTER_API_KEY=
BOT_OWNER_ID=
WEBAPP_URL=https://example.com/webapp

# Optional
WEBHOOK_URL=
KEYDB_URL=redis://localhost:6379
PORT=3000
```

- [ ] **Step 6: Update .gitignore**

Append to `.gitignore`:
```
# editor
.vscode
*.swp

# bun
bun.lockb
```

- [ ] **Step 7: Verify install worked**

Run: `bun typecheck`
Expected: compiles cleanly (no errors). If it errors on the existing `index.ts`, that's fine — leave the old `console.log` for now; it will be replaced.

- [ ] **Step 8: Commit**

```bash
git add package.json bun.lock .env.example bunfig.toml .gitignore
git commit -m "chore: install bot dependencies and tooling"
```

---

## Task 2: Shared domain types

**Files:**
- Create: `src/shared/types.ts`

- [ ] **Step 1: Create the types file**

Create `src/shared/types.ts`:
```ts
export type RateLimitConfig = {
  capacity: number;
  refillAmount: number;
  refillIntervalMs: number;
  ownerExempt: boolean;
};

export type Settings = {
  systemPrompt: string;
  model: string;
  rateLimit: RateLimitConfig;
};

export type WhitelistEntry = {
  id: string;
  label?: string;
};

export type Whitelist = {
  users: WhitelistEntry[];
  chats: WhitelistEntry[];
};

export type BucketState = {
  tokens: number;
  lastRefillTs: number;
};

export type ConversationNode = {
  userQuestion: string;
  botAnswer: string;
  parentBotMsgId: number | null;
  ts: number;
};

export const DEFAULT_SETTINGS: Settings = {
  systemPrompt: "You are a helpful assistant in a Telegram chat. Be concise.",
  model: "anthropic/claude-sonnet-4-5",
  rateLimit: {
    capacity: 30000,
    refillAmount: 3000,
    refillIntervalMs: 40 * 60 * 1000,
    ownerExempt: true,
  },
};

export const MAX_REPLY_CHAIN_DEPTH = 20;
export const CONVERSATION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
```

- [ ] **Step 2: Typecheck**

Run: `bun typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add shared domain types"
```

---

## Task 3: Config module

**Files:**
- Create: `src/config.ts`
- Create: `src/config.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/config.test.ts`:
```ts
import { test, expect } from "bun:test";
import { loadConfig } from "./config";

test("loadConfig returns required fields when all env vars present", () => {
  const cfg = loadConfig({
    BOT_TOKEN: "tok",
    OPENROUTER_API_KEY: "or",
    BOT_OWNER_ID: "12345",
    WEBAPP_URL: "https://example.com/app",
  });
  expect(cfg.botToken).toBe("tok");
  expect(cfg.openrouterApiKey).toBe("or");
  expect(cfg.botOwnerId).toBe("12345");
  expect(cfg.webappUrl).toBe("https://example.com/app");
  expect(cfg.keydbUrl).toBe("redis://localhost:6379");
  expect(cfg.port).toBe(3000);
  expect(cfg.webhookUrl).toBeUndefined();
});

test("loadConfig throws on missing required field", () => {
  expect(() =>
    loadConfig({ BOT_TOKEN: "tok" } as Record<string, string>),
  ).toThrow(/OPENROUTER_API_KEY/);
});

test("loadConfig parses optional overrides", () => {
  const cfg = loadConfig({
    BOT_TOKEN: "tok",
    OPENROUTER_API_KEY: "or",
    BOT_OWNER_ID: "1",
    WEBAPP_URL: "https://example.com",
    WEBHOOK_URL: "https://example.com/hook",
    KEYDB_URL: "redis://other:6379",
    PORT: "4000",
  });
  expect(cfg.webhookUrl).toBe("https://example.com/hook");
  expect(cfg.keydbUrl).toBe("redis://other:6379");
  expect(cfg.port).toBe(4000);
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `bun test src/config.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement config**

Create `src/config.ts`:
```ts
export type Config = {
  botToken: string;
  openrouterApiKey: string;
  botOwnerId: string;
  webappUrl: string;
  webhookUrl: string | undefined;
  keydbUrl: string;
  port: number;
};

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const required = (name: string): string => {
    const v = env[name];
    if (!v) throw new Error(`Missing required env var: ${name}`);
    return v;
  };

  const port = env.PORT ? Number(env.PORT) : 3000;
  if (Number.isNaN(port)) throw new Error(`PORT must be a number, got: ${env.PORT}`);

  return {
    botToken: required("BOT_TOKEN"),
    openrouterApiKey: required("OPENROUTER_API_KEY"),
    botOwnerId: required("BOT_OWNER_ID"),
    webappUrl: required("WEBAPP_URL"),
    webhookUrl: env.WEBHOOK_URL,
    keydbUrl: env.KEYDB_URL ?? "redis://localhost:6379",
    port,
  };
}
```

- [ ] **Step 4: Run tests**

Run: `bun test src/config.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/config.ts src/config.test.ts
git commit -m "feat: add config loader"
```

---

## Task 4: Storage interface and in-memory adapter

**Files:**
- Create: `src/storage/types.ts`
- Create: `src/storage/memory.ts`
- Create: `src/storage/memory.test.ts`

- [ ] **Step 1: Define the interface**

Create `src/storage/types.ts`:
```ts
import type {
  Settings,
  WhitelistEntry,
  BucketState,
  ConversationNode,
} from "../shared/types";

export interface Storage {
  getSettings(): Promise<Settings | null>;
  saveSettings(settings: Settings): Promise<void>;

  listWhitelist(kind: "users" | "chats"): Promise<WhitelistEntry[]>;
  addWhitelist(kind: "users" | "chats", entry: WhitelistEntry): Promise<void>;
  removeWhitelist(kind: "users" | "chats", id: string): Promise<void>;
  isWhitelisted(kind: "users" | "chats", id: string): Promise<boolean>;

  getBucket(userId: string): Promise<BucketState | null>;
  saveBucket(userId: string, state: BucketState): Promise<void>;

  getConversation(chatId: string, botMsgId: number): Promise<ConversationNode | null>;
  saveConversation(
    chatId: string,
    botMsgId: number,
    node: ConversationNode,
  ): Promise<void>;
}
```

- [ ] **Step 2: Write tests for memory adapter**

Create `src/storage/memory.test.ts`:
```ts
import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "./memory";
import { DEFAULT_SETTINGS } from "../shared/types";

describe("MemoryStorage settings", () => {
  test("returns null when not set", async () => {
    const s = new MemoryStorage();
    expect(await s.getSettings()).toBeNull();
  });

  test("round-trips a saved value", async () => {
    const s = new MemoryStorage();
    await s.saveSettings(DEFAULT_SETTINGS);
    expect(await s.getSettings()).toEqual(DEFAULT_SETTINGS);
  });
});

describe("MemoryStorage whitelist", () => {
  test("starts empty", async () => {
    const s = new MemoryStorage();
    expect(await s.listWhitelist("users")).toEqual([]);
    expect(await s.isWhitelisted("users", "1")).toBe(false);
  });

  test("add then list and check", async () => {
    const s = new MemoryStorage();
    await s.addWhitelist("users", { id: "42", label: "alice" });
    await s.addWhitelist("chats", { id: "-100", label: "team" });
    expect(await s.listWhitelist("users")).toEqual([{ id: "42", label: "alice" }]);
    expect(await s.isWhitelisted("users", "42")).toBe(true);
    expect(await s.isWhitelisted("chats", "-100")).toBe(true);
    expect(await s.isWhitelisted("users", "-100")).toBe(false);
  });

  test("add is idempotent on id, last label wins", async () => {
    const s = new MemoryStorage();
    await s.addWhitelist("users", { id: "42", label: "a" });
    await s.addWhitelist("users", { id: "42", label: "b" });
    expect(await s.listWhitelist("users")).toEqual([{ id: "42", label: "b" }]);
  });

  test("remove removes the entry", async () => {
    const s = new MemoryStorage();
    await s.addWhitelist("users", { id: "42" });
    await s.removeWhitelist("users", "42");
    expect(await s.isWhitelisted("users", "42")).toBe(false);
  });
});

describe("MemoryStorage bucket", () => {
  test("round-trips", async () => {
    const s = new MemoryStorage();
    await s.saveBucket("u1", { tokens: 100, lastRefillTs: 12345 });
    expect(await s.getBucket("u1")).toEqual({ tokens: 100, lastRefillTs: 12345 });
  });
});

describe("MemoryStorage conversation", () => {
  test("round-trips by (chatId, botMsgId)", async () => {
    const s = new MemoryStorage();
    await s.saveConversation("c1", 10, {
      userQuestion: "Q",
      botAnswer: "A",
      parentBotMsgId: null,
      ts: 1,
    });
    expect(await s.getConversation("c1", 10)).toEqual({
      userQuestion: "Q",
      botAnswer: "A",
      parentBotMsgId: null,
      ts: 1,
    });
    expect(await s.getConversation("c1", 11)).toBeNull();
    expect(await s.getConversation("c2", 10)).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests to verify failure**

Run: `bun test src/storage/memory.test.ts`
Expected: FAIL — `MemoryStorage` not found.

- [ ] **Step 4: Implement memory adapter**

Create `src/storage/memory.ts`:
```ts
import type { Storage } from "./types";
import type {
  Settings,
  WhitelistEntry,
  BucketState,
  ConversationNode,
} from "../shared/types";

export class MemoryStorage implements Storage {
  private settings: Settings | null = null;
  private whitelist: Record<"users" | "chats", Map<string, WhitelistEntry>> = {
    users: new Map(),
    chats: new Map(),
  };
  private buckets = new Map<string, BucketState>();
  private conversations = new Map<string, ConversationNode>();

  private convKey(chatId: string, botMsgId: number): string {
    return `${chatId}:${botMsgId}`;
  }

  async getSettings(): Promise<Settings | null> {
    return this.settings ? structuredClone(this.settings) : null;
  }

  async saveSettings(settings: Settings): Promise<void> {
    this.settings = structuredClone(settings);
  }

  async listWhitelist(kind: "users" | "chats"): Promise<WhitelistEntry[]> {
    return [...this.whitelist[kind].values()];
  }

  async addWhitelist(kind: "users" | "chats", entry: WhitelistEntry): Promise<void> {
    this.whitelist[kind].set(entry.id, { ...entry });
  }

  async removeWhitelist(kind: "users" | "chats", id: string): Promise<void> {
    this.whitelist[kind].delete(id);
  }

  async isWhitelisted(kind: "users" | "chats", id: string): Promise<boolean> {
    return this.whitelist[kind].has(id);
  }

  async getBucket(userId: string): Promise<BucketState | null> {
    const v = this.buckets.get(userId);
    return v ? { ...v } : null;
  }

  async saveBucket(userId: string, state: BucketState): Promise<void> {
    this.buckets.set(userId, { ...state });
  }

  async getConversation(chatId: string, botMsgId: number): Promise<ConversationNode | null> {
    const v = this.conversations.get(this.convKey(chatId, botMsgId));
    return v ? { ...v } : null;
  }

  async saveConversation(
    chatId: string,
    botMsgId: number,
    node: ConversationNode,
  ): Promise<void> {
    this.conversations.set(this.convKey(chatId, botMsgId), { ...node });
  }
}
```

- [ ] **Step 5: Run tests**

Run: `bun test src/storage/memory.test.ts`
Expected: PASS (all tests).

- [ ] **Step 6: Commit**

```bash
git add src/storage/types.ts src/storage/memory.ts src/storage/memory.test.ts
git commit -m "feat: add Storage interface and in-memory adapter"
```

---

## Task 5: KeyDB adapter

**Files:**
- Create: `src/storage/keydb.ts`

- [ ] **Step 1: Implement KeyDB adapter**

Create `src/storage/keydb.ts`:
```ts
import { RedisClient } from "bun";
import type { Storage } from "./types";
import type {
  Settings,
  WhitelistEntry,
  BucketState,
  ConversationNode,
} from "../shared/types";
import { CONVERSATION_TTL_SECONDS } from "../shared/types";

const PREFIX = "at:";

export class KeyDBStorage implements Storage {
  constructor(private readonly client: RedisClient) {}

  static async connect(url: string): Promise<KeyDBStorage> {
    const client = new RedisClient(url);
    await client.connect();
    return new KeyDBStorage(client);
  }

  async getSettings(): Promise<Settings | null> {
    const raw = await this.client.get(`${PREFIX}settings`);
    return raw ? (JSON.parse(raw) as Settings) : null;
  }

  async saveSettings(settings: Settings): Promise<void> {
    await this.client.set(`${PREFIX}settings`, JSON.stringify(settings));
  }

  async listWhitelist(kind: "users" | "chats"): Promise<WhitelistEntry[]> {
    const raw = await this.client.get(`${PREFIX}whitelist:${kind}`);
    return raw ? (JSON.parse(raw) as WhitelistEntry[]) : [];
  }

  async addWhitelist(kind: "users" | "chats", entry: WhitelistEntry): Promise<void> {
    const list = await this.listWhitelist(kind);
    const next = [...list.filter((e) => e.id !== entry.id), { ...entry }];
    await this.client.set(`${PREFIX}whitelist:${kind}`, JSON.stringify(next));
  }

  async removeWhitelist(kind: "users" | "chats", id: string): Promise<void> {
    const list = await this.listWhitelist(kind);
    const next = list.filter((e) => e.id !== id);
    await this.client.set(`${PREFIX}whitelist:${kind}`, JSON.stringify(next));
  }

  async isWhitelisted(kind: "users" | "chats", id: string): Promise<boolean> {
    const list = await this.listWhitelist(kind);
    return list.some((e) => e.id === id);
  }

  async getBucket(userId: string): Promise<BucketState | null> {
    const raw = await this.client.get(`${PREFIX}bucket:${userId}`);
    return raw ? (JSON.parse(raw) as BucketState) : null;
  }

  async saveBucket(userId: string, state: BucketState): Promise<void> {
    await this.client.set(`${PREFIX}bucket:${userId}`, JSON.stringify(state));
  }

  async getConversation(chatId: string, botMsgId: number): Promise<ConversationNode | null> {
    const raw = await this.client.get(`${PREFIX}msg:${chatId}:${botMsgId}`);
    return raw ? (JSON.parse(raw) as ConversationNode) : null;
  }

  async saveConversation(
    chatId: string,
    botMsgId: number,
    node: ConversationNode,
  ): Promise<void> {
    const key = `${PREFIX}msg:${chatId}:${botMsgId}`;
    await this.client.set(key, JSON.stringify(node));
    await this.client.expire(key, CONVERSATION_TTL_SECONDS);
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `bun typecheck`
Expected: no errors. If `RedisClient.expire` signature differs in your Bun version, check `node_modules/bun-types/docs/api/redis.mdx` and adjust (may be `client.send("EXPIRE", [key, ttl])`).

- [ ] **Step 3: Commit**

```bash
git add src/storage/keydb.ts
git commit -m "feat: add KeyDB storage adapter"
```

---

## Task 6: Token-bucket rate limiter

**Files:**
- Create: `src/ratelimit/types.ts`
- Create: `src/ratelimit/token-bucket.ts`
- Create: `src/ratelimit/token-bucket.test.ts`

- [ ] **Step 1: Define interface**

Create `src/ratelimit/types.ts`:
```ts
import type { RateLimitConfig, BucketState } from "../shared/types";

export type CheckResult =
  | { allowed: true; bucket: BucketState }
  | { allowed: false; bucket: BucketState; msUntilNextRefill: number };

export interface RateLimiter {
  check(userId: string, config: RateLimitConfig, now: number): Promise<CheckResult>;
  deduct(userId: string, tokens: number): Promise<void>;
  reset(userId: string, config: RateLimitConfig, now: number): Promise<void>;
}
```

- [ ] **Step 2: Write failing tests**

Create `src/ratelimit/token-bucket.test.ts`:
```ts
import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "../storage/memory";
import { TokenBucketLimiter } from "./token-bucket";
import type { RateLimitConfig } from "../shared/types";

const cfg: RateLimitConfig = {
  capacity: 30000,
  refillAmount: 3000,
  refillIntervalMs: 40 * 60 * 1000,
  ownerExempt: true,
};

describe("TokenBucketLimiter", () => {
  test("first check seeds bucket at capacity", async () => {
    const lim = new TokenBucketLimiter(new MemoryStorage());
    const r = await lim.check("u1", cfg, 1000);
    expect(r.allowed).toBe(true);
    if (r.allowed) {
      expect(r.bucket.tokens).toBe(30000);
      expect(r.bucket.lastRefillTs).toBe(1000);
    }
  });

  test("deduct subtracts tokens and persists", async () => {
    const storage = new MemoryStorage();
    const lim = new TokenBucketLimiter(storage);
    await lim.check("u1", cfg, 1000);
    await lim.deduct("u1", 500);
    const b = await storage.getBucket("u1");
    expect(b?.tokens).toBe(29500);
  });

  test("denies when tokens <= 0", async () => {
    const storage = new MemoryStorage();
    const lim = new TokenBucketLimiter(storage);
    await storage.saveBucket("u1", { tokens: 0, lastRefillTs: 1000 });
    const r = await lim.check("u1", cfg, 1000);
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.msUntilNextRefill).toBe(cfg.refillIntervalMs);
    }
  });

  test("refills lazily based on elapsed intervals", async () => {
    const storage = new MemoryStorage();
    const lim = new TokenBucketLimiter(storage);
    await storage.saveBucket("u1", { tokens: 0, lastRefillTs: 1000 });
    // 2 full intervals elapsed → +6000
    const r = await lim.check("u1", cfg, 1000 + 2 * cfg.refillIntervalMs);
    expect(r.allowed).toBe(true);
    if (r.allowed) {
      expect(r.bucket.tokens).toBe(6000);
      expect(r.bucket.lastRefillTs).toBe(1000 + 2 * cfg.refillIntervalMs);
    }
  });

  test("refill is capped at capacity", async () => {
    const storage = new MemoryStorage();
    const lim = new TokenBucketLimiter(storage);
    await storage.saveBucket("u1", { tokens: 29000, lastRefillTs: 1000 });
    const r = await lim.check("u1", cfg, 1000 + 100 * cfg.refillIntervalMs);
    expect(r.allowed).toBe(true);
    if (r.allowed) expect(r.bucket.tokens).toBe(cfg.capacity);
  });

  test("partial interval does not refill", async () => {
    const storage = new MemoryStorage();
    const lim = new TokenBucketLimiter(storage);
    await storage.saveBucket("u1", { tokens: 100, lastRefillTs: 1000 });
    const r = await lim.check("u1", cfg, 1000 + cfg.refillIntervalMs - 1);
    expect(r.allowed).toBe(true);
    if (r.allowed) {
      expect(r.bucket.tokens).toBe(100);
      expect(r.bucket.lastRefillTs).toBe(1000);
    }
  });

  test("reset puts bucket at full capacity", async () => {
    const storage = new MemoryStorage();
    const lim = new TokenBucketLimiter(storage);
    await storage.saveBucket("u1", { tokens: -500, lastRefillTs: 1 });
    await lim.reset("u1", cfg, 9999);
    const b = await storage.getBucket("u1");
    expect(b).toEqual({ tokens: cfg.capacity, lastRefillTs: 9999 });
  });

  test("deduct can drive bucket negative (request already in flight)", async () => {
    const storage = new MemoryStorage();
    const lim = new TokenBucketLimiter(storage);
    await storage.saveBucket("u1", { tokens: 100, lastRefillTs: 1 });
    await lim.deduct("u1", 1000);
    expect((await storage.getBucket("u1"))?.tokens).toBe(-900);
  });
});
```

- [ ] **Step 3: Run tests to verify failure**

Run: `bun test src/ratelimit/token-bucket.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement token bucket**

Create `src/ratelimit/token-bucket.ts`:
```ts
import type { Storage } from "../storage/types";
import type { RateLimiter, CheckResult } from "./types";
import type { RateLimitConfig, BucketState } from "../shared/types";

export class TokenBucketLimiter implements RateLimiter {
  constructor(private readonly storage: Storage) {}

  private async loadOrSeed(
    userId: string,
    config: RateLimitConfig,
    now: number,
  ): Promise<BucketState> {
    const existing = await this.storage.getBucket(userId);
    if (existing) return existing;
    const seeded: BucketState = { tokens: config.capacity, lastRefillTs: now };
    await this.storage.saveBucket(userId, seeded);
    return seeded;
  }

  private refill(state: BucketState, config: RateLimitConfig, now: number): BucketState {
    const elapsed = now - state.lastRefillTs;
    if (elapsed < config.refillIntervalMs) return state;
    const periods = Math.floor(elapsed / config.refillIntervalMs);
    const newTokens = Math.min(config.capacity, state.tokens + periods * config.refillAmount);
    return {
      tokens: newTokens,
      lastRefillTs: state.lastRefillTs + periods * config.refillIntervalMs,
    };
  }

  async check(
    userId: string,
    config: RateLimitConfig,
    now: number,
  ): Promise<CheckResult> {
    const seeded = await this.loadOrSeed(userId, config, now);
    const refilled = this.refill(seeded, config, now);
    if (refilled !== seeded) {
      await this.storage.saveBucket(userId, refilled);
    }
    if (refilled.tokens <= 0) {
      const elapsed = now - refilled.lastRefillTs;
      const msUntilNextRefill = config.refillIntervalMs - elapsed;
      return { allowed: false, bucket: refilled, msUntilNextRefill };
    }
    return { allowed: true, bucket: refilled };
  }

  async deduct(userId: string, tokens: number): Promise<void> {
    const current = await this.storage.getBucket(userId);
    if (!current) return;
    await this.storage.saveBucket(userId, {
      tokens: current.tokens - tokens,
      lastRefillTs: current.lastRefillTs,
    });
  }

  async reset(userId: string, config: RateLimitConfig, now: number): Promise<void> {
    await this.storage.saveBucket(userId, {
      tokens: config.capacity,
      lastRefillTs: now,
    });
  }
}
```

- [ ] **Step 5: Run tests**

Run: `bun test src/ratelimit/token-bucket.test.ts`
Expected: PASS (all tests).

- [ ] **Step 6: Commit**

```bash
git add src/ratelimit/types.ts src/ratelimit/token-bucket.ts src/ratelimit/token-bucket.test.ts
git commit -m "feat: add token-bucket rate limiter"
```

---

## Task 7: Tool registry and `random_number` tool

**Files:**
- Create: `src/ai/tools/registry.ts`
- Create: `src/ai/tools/random-number.ts`
- Create: `src/ai/tools/random-number.test.ts`

- [ ] **Step 1: Define registry**

Create `src/ai/tools/registry.ts`:
```ts
import { z } from "zod";

export type Tool<TInput = unknown, TOutput = unknown> = {
  name: string;
  description: string;
  parameters: z.ZodType<TInput>;
  execute: (input: TInput) => Promise<TOutput> | TOutput;
};

const registry = new Map<string, Tool>();

export function registerTool<TIn, TOut>(tool: Tool<TIn, TOut>): void {
  registry.set(tool.name, tool as Tool);
}

export function getAllTools(): Tool[] {
  return [...registry.values()];
}

export function _resetRegistryForTest(): void {
  registry.clear();
}
```

- [ ] **Step 2: Write failing test for random-number**

Create `src/ai/tools/random-number.test.ts`:
```ts
import { test, expect, describe } from "bun:test";
import { randomNumberTool } from "./random-number";

describe("random_number tool", () => {
  test("returns integer in [min, max]", async () => {
    for (let i = 0; i < 100; i++) {
      const r = await randomNumberTool.execute({ min: 1, max: 10 });
      expect(Number.isInteger(r)).toBe(true);
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(10);
    }
  });

  test("works when min == max", async () => {
    expect(await randomNumberTool.execute({ min: 7, max: 7 })).toBe(7);
  });

  test("rejects min > max via zod parse", () => {
    const result = randomNumberTool.parameters.safeParse({ min: 10, max: 1 });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests to verify failure**

Run: `bun test src/ai/tools/random-number.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement random_number**

Create `src/ai/tools/random-number.ts`:
```ts
import { z } from "zod";
import type { Tool } from "./registry";

const Schema = z
  .object({
    min: z.number().int(),
    max: z.number().int(),
  })
  .refine((v) => v.min <= v.max, { message: "min must be <= max" });

type Input = z.infer<typeof Schema>;

export const randomNumberTool: Tool<Input, number> = {
  name: "random_number",
  description:
    "Pick a random integer in the inclusive range [min, max]. Use this when the user asks to think of, guess, or roll a number.",
  parameters: Schema,
  execute: ({ min, max }) => Math.floor(Math.random() * (max - min + 1)) + min,
};
```

- [ ] **Step 5: Run tests**

Run: `bun test src/ai/tools/random-number.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ai/tools/registry.ts src/ai/tools/random-number.ts src/ai/tools/random-number.test.ts
git commit -m "feat: add tool registry and random_number tool"
```

---

## Task 8: AI client (OpenRouter via Vercel AI SDK)

**Files:**
- Create: `src/ai/types.ts`
- Create: `src/ai/openrouter.ts`

- [ ] **Step 1: Define interface**

Create `src/ai/types.ts`:
```ts
import type { Tool } from "./tools/registry";

export type AIMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string };

export type AskResult = {
  text: string;
  totalTokens: number;
};

export interface AIClient {
  ask(opts: {
    model: string;
    messages: AIMessage[];
    tools: Tool[];
  }): Promise<AskResult>;
}
```

- [ ] **Step 2: Implement OpenRouter client**

Create `src/ai/openrouter.ts`:
```ts
import { generateText, tool as aiTool } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { AIClient, AIMessage, AskResult } from "./types";
import type { Tool } from "./tools/registry";

export class OpenRouterAIClient implements AIClient {
  private readonly provider: ReturnType<typeof createOpenRouter>;

  constructor(apiKey: string) {
    this.provider = createOpenRouter({ apiKey });
  }

  async ask(opts: {
    model: string;
    messages: AIMessage[];
    tools: Tool[];
  }): Promise<AskResult> {
    const toolMap: Record<string, ReturnType<typeof aiTool>> = {};
    for (const t of opts.tools) {
      toolMap[t.name] = aiTool({
        description: t.description,
        parameters: t.parameters,
        execute: async (input: unknown) => t.execute(input),
      });
    }

    const result = await generateText({
      model: this.provider(opts.model),
      messages: opts.messages,
      tools: Object.keys(toolMap).length > 0 ? toolMap : undefined,
      maxSteps: 5,
    });

    return {
      text: result.text,
      totalTokens: result.usage?.totalTokens ?? 0,
    };
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `bun typecheck`
Expected: no errors. If `generateText` or `tool` signatures differ in your installed `ai` package version, check `node_modules/ai/README.md` and adjust the call site (the public surface for `generateText({ model, messages, tools })` has been stable across recent versions).

- [ ] **Step 4: Commit**

```bash
git add src/ai/types.ts src/ai/openrouter.ts
git commit -m "feat: add OpenRouter AI client"
```

---

## Task 9: Reply-chain context builder

**Files:**
- Create: `src/bot/context-builder.ts`
- Create: `src/bot/context-builder.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/bot/context-builder.test.ts`:
```ts
import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "../storage/memory";
import { buildContext } from "./context-builder";

describe("buildContext", () => {
  test("no reply: just system + current user message", async () => {
    const storage = new MemoryStorage();
    const msgs = await buildContext({
      storage,
      chatId: "c1",
      systemPrompt: "SYS",
      userText: "hello",
      replyTarget: null,
    });
    expect(msgs).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "hello" },
    ]);
  });

  test("reply to non-bot message includes synthetic context", async () => {
    const storage = new MemoryStorage();
    const msgs = await buildContext({
      storage,
      chatId: "c1",
      systemPrompt: "SYS",
      userText: "what does that mean",
      replyTarget: { messageId: 999, text: "to be or not to be", authorFirstName: "Alice" },
    });
    expect(msgs).toEqual([
      { role: "system", content: "SYS" },
      {
        role: "user",
        content: "Context (replied message from Alice): to be or not to be",
      },
      { role: "user", content: "what does that mean" },
    ]);
  });

  test("reply to bot message walks single ancestor", async () => {
    const storage = new MemoryStorage();
    await storage.saveConversation("c1", 100, {
      userQuestion: "Q1",
      botAnswer: "A1",
      parentBotMsgId: null,
      ts: 1,
    });
    const msgs = await buildContext({
      storage,
      chatId: "c1",
      systemPrompt: "SYS",
      userText: "follow-up",
      replyTarget: { messageId: 100, text: "A1", authorFirstName: "Bot" },
    });
    expect(msgs).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "Q1" },
      { role: "assistant", content: "A1" },
      { role: "user", content: "follow-up" },
    ]);
  });

  test("reply chain walks ancestors in chronological order", async () => {
    const storage = new MemoryStorage();
    await storage.saveConversation("c1", 100, {
      userQuestion: "Q1",
      botAnswer: "A1",
      parentBotMsgId: null,
      ts: 1,
    });
    await storage.saveConversation("c1", 200, {
      userQuestion: "Q2",
      botAnswer: "A2",
      parentBotMsgId: 100,
      ts: 2,
    });
    const msgs = await buildContext({
      storage,
      chatId: "c1",
      systemPrompt: "SYS",
      userText: "Q3",
      replyTarget: { messageId: 200, text: "A2", authorFirstName: "Bot" },
    });
    expect(msgs).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "Q1" },
      { role: "assistant", content: "A1" },
      { role: "user", content: "Q2" },
      { role: "assistant", content: "A2" },
      { role: "user", content: "Q3" },
    ]);
  });

  test("missing ancestor stops walk and includes synthetic for current node", async () => {
    const storage = new MemoryStorage();
    // Storage has no node for messageId=500
    const msgs = await buildContext({
      storage,
      chatId: "c1",
      systemPrompt: "SYS",
      userText: "hi",
      replyTarget: { messageId: 500, text: "old bot reply", authorFirstName: "Bot" },
    });
    expect(msgs).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "Context (replied message from Bot): old bot reply" },
      { role: "user", content: "hi" },
    ]);
  });

  test("depth cap honored", async () => {
    const storage = new MemoryStorage();
    // Build a very deep chain
    const depth = 25;
    let prevId: number | null = null;
    for (let i = 1; i <= depth; i++) {
      await storage.saveConversation("c1", i, {
        userQuestion: `Q${i}`,
        botAnswer: `A${i}`,
        parentBotMsgId: prevId,
        ts: i,
      });
      prevId = i;
    }
    const msgs = await buildContext({
      storage,
      chatId: "c1",
      systemPrompt: "SYS",
      userText: "next",
      replyTarget: { messageId: depth, text: `A${depth}`, authorFirstName: "Bot" },
      maxDepth: 5,
    });
    // 1 system + (5 user + 5 assistant) + 1 current user = 12
    expect(msgs.length).toBe(12);
    expect(msgs[1]).toEqual({ role: "user", content: `Q${depth - 4}` });
  });

  test("reply target without text uses <media> placeholder", async () => {
    const storage = new MemoryStorage();
    const msgs = await buildContext({
      storage,
      chatId: "c1",
      systemPrompt: "SYS",
      userText: "what is this",
      replyTarget: { messageId: 12, text: null, authorFirstName: "Alice" },
    });
    expect(msgs[1]).toEqual({
      role: "user",
      content: "Context (replied message from Alice): <media>",
    });
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `bun test src/bot/context-builder.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement context builder**

Create `src/bot/context-builder.ts`:
```ts
import type { Storage } from "../storage/types";
import type { AIMessage } from "../ai/types";
import { MAX_REPLY_CHAIN_DEPTH } from "../shared/types";

export type ReplyTarget = {
  messageId: number;
  text: string | null;
  authorFirstName: string | null;
};

export type BuildContextArgs = {
  storage: Storage;
  chatId: string;
  systemPrompt: string;
  userText: string;
  replyTarget: ReplyTarget | null;
  maxDepth?: number;
};

export async function buildContext(args: BuildContextArgs): Promise<AIMessage[]> {
  const { storage, chatId, systemPrompt, userText, replyTarget } = args;
  const maxDepth = args.maxDepth ?? MAX_REPLY_CHAIN_DEPTH;
  const messages: AIMessage[] = [{ role: "system", content: systemPrompt }];

  if (replyTarget !== null) {
    const node = await storage.getConversation(chatId, replyTarget.messageId);
    if (node) {
      const chain = await collectChain(storage, chatId, replyTarget.messageId, maxDepth);
      for (const c of chain) {
        messages.push({ role: "user", content: c.userQuestion });
        messages.push({ role: "assistant", content: c.botAnswer });
      }
    } else {
      const author = replyTarget.authorFirstName ?? "unknown";
      const text = replyTarget.text ?? "<media>";
      messages.push({
        role: "user",
        content: `Context (replied message from ${author}): ${text}`,
      });
    }
  }

  messages.push({ role: "user", content: userText });
  return messages;
}

async function collectChain(
  storage: Storage,
  chatId: string,
  startBotMsgId: number,
  maxDepth: number,
): Promise<Array<{ userQuestion: string; botAnswer: string }>> {
  const chain: Array<{ userQuestion: string; botAnswer: string }> = [];
  let cursor: number | null = startBotMsgId;
  while (cursor !== null && chain.length < maxDepth) {
    const node = await storage.getConversation(chatId, cursor);
    if (!node) break;
    chain.unshift({ userQuestion: node.userQuestion, botAnswer: node.botAnswer });
    cursor = node.parentBotMsgId;
  }
  return chain;
}
```

- [ ] **Step 4: Run tests**

Run: `bun test src/bot/context-builder.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/bot/context-builder.ts src/bot/context-builder.test.ts
git commit -m "feat: add reply-chain context builder"
```

---

## Task 10: Whitelist gate (pure function)

**Files:**
- Create: `src/bot/access.ts`
- Create: `src/bot/access.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/bot/access.test.ts`:
```ts
import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "../storage/memory";
import { isAllowed } from "./access";

describe("isAllowed", () => {
  test("owner always allowed regardless of whitelist", async () => {
    const storage = new MemoryStorage();
    expect(
      await isAllowed({ storage, ownerId: "1", userId: "1", chatId: "any" }),
    ).toBe(true);
  });

  test("non-owner with whitelisted user passes in any chat", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    expect(
      await isAllowed({ storage, ownerId: "1", userId: "42", chatId: "x" }),
    ).toBe(true);
  });

  test("non-owner in whitelisted chat passes", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("chats", { id: "-100" });
    expect(
      await isAllowed({ storage, ownerId: "1", userId: "42", chatId: "-100" }),
    ).toBe(true);
  });

  test("neither user nor chat whitelisted: denied", async () => {
    const storage = new MemoryStorage();
    expect(
      await isAllowed({ storage, ownerId: "1", userId: "42", chatId: "x" }),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `bun test src/bot/access.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement gate**

Create `src/bot/access.ts`:
```ts
import type { Storage } from "../storage/types";

export async function isAllowed(args: {
  storage: Storage;
  ownerId: string;
  userId: string;
  chatId: string;
}): Promise<boolean> {
  const { storage, ownerId, userId, chatId } = args;
  if (userId === ownerId) return true;
  if (await storage.isWhitelisted("users", userId)) return true;
  if (await storage.isWhitelisted("chats", chatId)) return true;
  return false;
}
```

- [ ] **Step 4: Run tests**

Run: `bun test src/bot/access.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/bot/access.ts src/bot/access.test.ts
git commit -m "feat: add whitelist access gate"
```

---

## Task 11: Settings loader (with defaults fallback)

**Files:**
- Create: `src/settings.ts`
- Create: `src/settings.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/settings.test.ts`:
```ts
import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "./storage/memory";
import { getOrInitSettings } from "./settings";
import { DEFAULT_SETTINGS } from "./shared/types";

describe("getOrInitSettings", () => {
  test("returns defaults and persists them on first call", async () => {
    const storage = new MemoryStorage();
    const s = await getOrInitSettings(storage);
    expect(s).toEqual(DEFAULT_SETTINGS);
    expect(await storage.getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  test("returns existing settings", async () => {
    const storage = new MemoryStorage();
    const custom = {
      ...DEFAULT_SETTINGS,
      systemPrompt: "custom",
      model: "openai/gpt-4o-mini",
    };
    await storage.saveSettings(custom);
    expect(await getOrInitSettings(storage)).toEqual(custom);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `bun test src/settings.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement settings**

Create `src/settings.ts`:
```ts
import type { Storage } from "./storage/types";
import type { Settings } from "./shared/types";
import { DEFAULT_SETTINGS } from "./shared/types";

export async function getOrInitSettings(storage: Storage): Promise<Settings> {
  const existing = await storage.getSettings();
  if (existing) return existing;
  await storage.saveSettings(DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
}
```

- [ ] **Step 4: Run tests**

Run: `bun test src/settings.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/settings.ts src/settings.test.ts
git commit -m "feat: add settings loader with default fallback"
```

---

## Task 12: `/ask` orchestrator

This task wires the gate, context builder, rate limiter, AI client, and storage together. Tests use mock implementations of `AIClient` to verify the orchestration.

**Files:**
- Create: `src/bot/handlers/ask.ts`
- Create: `src/bot/handlers/ask.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/bot/handlers/ask.test.ts`:
```ts
import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "../../storage/memory";
import { TokenBucketLimiter } from "../../ratelimit/token-bucket";
import type { AIClient, AskResult } from "../../ai/types";
import { askHandler, type AskInput, type AskOutcome } from "./ask";
import { DEFAULT_SETTINGS } from "../../shared/types";

class FakeAI implements AIClient {
  constructor(public reply: AskResult = { text: "mock reply", totalTokens: 100 }) {}
  calls: unknown[] = [];
  async ask(opts: Parameters<AIClient["ask"]>[0]): Promise<AskResult> {
    this.calls.push(opts);
    return this.reply;
  }
}

const baseInput = (overrides: Partial<AskInput> = {}): AskInput => ({
  storage: new MemoryStorage(),
  rateLimiter: new TokenBucketLimiter(new MemoryStorage()),
  ai: new FakeAI(),
  ownerId: "1",
  now: 1_000,
  chatId: "c1",
  userId: "42",
  userText: "hello",
  replyTarget: null,
  ...overrides,
});

describe("askHandler", () => {
  test("denied when not whitelisted and not owner", async () => {
    const out: AskOutcome = await askHandler(baseInput());
    expect(out.kind).toBe("denied");
  });

  test("usage hint when text is empty and no reply", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const out = await askHandler(baseInput({ storage, userText: "" }));
    expect(out.kind).toBe("usage");
  });

  test("rate-limit hit returns rateLimited", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const rlStorage = new MemoryStorage();
    await rlStorage.saveBucket("42", { tokens: 0, lastRefillTs: 1000 });
    const rl = new TokenBucketLimiter(rlStorage);
    const out = await askHandler(baseInput({ storage, rateLimiter: rl }));
    expect(out.kind).toBe("rateLimited");
    if (out.kind === "rateLimited") expect(out.minutesUntilNextRefill).toBeGreaterThan(0);
  });

  test("owner with ownerExempt skips rate limit", async () => {
    const storage = new MemoryStorage();
    await storage.saveSettings({
      ...DEFAULT_SETTINGS,
      rateLimit: { ...DEFAULT_SETTINGS.rateLimit, ownerExempt: true },
    });
    const rlStorage = new MemoryStorage();
    await rlStorage.saveBucket("1", { tokens: 0, lastRefillTs: 1000 });
    const rl = new TokenBucketLimiter(rlStorage);
    const out = await askHandler(baseInput({ storage, userId: "1", rateLimiter: rl }));
    expect(out.kind).toBe("answered");
  });

  test("owner without ownerExempt is rate limited", async () => {
    const storage = new MemoryStorage();
    await storage.saveSettings({
      ...DEFAULT_SETTINGS,
      rateLimit: { ...DEFAULT_SETTINGS.rateLimit, ownerExempt: false },
    });
    const rlStorage = new MemoryStorage();
    await rlStorage.saveBucket("1", { tokens: 0, lastRefillTs: 1000 });
    const rl = new TokenBucketLimiter(rlStorage);
    const out = await askHandler(baseInput({ storage, userId: "1", rateLimiter: rl }));
    expect(out.kind).toBe("rateLimited");
  });

  test("answered: returns text and persistConversation callback to apply after sending", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const ai = new FakeAI({ text: "hi back", totalTokens: 250 });
    const rl = new TokenBucketLimiter(new MemoryStorage());
    const out = await askHandler(baseInput({ storage, ai, rateLimiter: rl }));
    expect(out.kind).toBe("answered");
    if (out.kind === "answered") {
      expect(out.text).toBe("hi back");
      // After bot sends message id 999 in the chat, caller invokes:
      await out.persistConversation(999);
      const node = await storage.getConversation("c1", 999);
      expect(node).toEqual({
        userQuestion: "hello",
        botAnswer: "hi back",
        parentBotMsgId: null,
        ts: 1000,
      });
    }
  });

  test("answered: persistConversation links parent when reply was to existing bot msg", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    await storage.saveConversation("c1", 100, {
      userQuestion: "Q1",
      botAnswer: "A1",
      parentBotMsgId: null,
      ts: 1,
    });
    const out = await askHandler(
      baseInput({
        storage,
        replyTarget: { messageId: 100, text: "A1", authorFirstName: "Bot" },
      }),
    );
    if (out.kind === "answered") {
      await out.persistConversation(200);
      expect(await storage.getConversation("c1", 200)).toMatchObject({
        parentBotMsgId: 100,
      });
    } else {
      throw new Error("expected answered");
    }
  });

  test("answered: deducts tokens from bucket", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    const rlStorage = new MemoryStorage();
    const rl = new TokenBucketLimiter(rlStorage);
    const ai = new FakeAI({ text: "ok", totalTokens: 1234 });
    const out = await askHandler(baseInput({ storage, rateLimiter: rl, ai }));
    expect(out.kind).toBe("answered");
    expect((await rlStorage.getBucket("42"))?.tokens).toBe(
      DEFAULT_SETTINGS.rateLimit.capacity - 1234,
    );
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `bun test src/bot/handlers/ask.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement handler**

Create `src/bot/handlers/ask.ts`:
```ts
import type { Storage } from "../../storage/types";
import type { RateLimiter } from "../../ratelimit/types";
import type { AIClient } from "../../ai/types";
import { isAllowed } from "../access";
import { buildContext, type ReplyTarget } from "../context-builder";
import { getOrInitSettings } from "../../settings";
import { getAllTools } from "../../ai/tools/registry";

export type AskInput = {
  storage: Storage;
  rateLimiter: RateLimiter;
  ai: AIClient;
  ownerId: string;
  now: number;
  chatId: string;
  userId: string;
  userText: string;
  replyTarget: ReplyTarget | null;
};

export type AskOutcome =
  | { kind: "denied" }
  | { kind: "usage" }
  | { kind: "rateLimited"; minutesUntilNextRefill: number }
  | {
      kind: "answered";
      text: string;
      persistConversation: (botMsgId: number) => Promise<void>;
    }
  | { kind: "error"; message: string };

export async function askHandler(input: AskInput): Promise<AskOutcome> {
  const allowed = await isAllowed({
    storage: input.storage,
    ownerId: input.ownerId,
    userId: input.userId,
    chatId: input.chatId,
  });
  if (!allowed) return { kind: "denied" };

  if (input.userText.trim() === "" && input.replyTarget === null) {
    return { kind: "usage" };
  }

  const settings = await getOrInitSettings(input.storage);

  const isOwner = input.userId === input.ownerId;
  const skipRateLimit = isOwner && settings.rateLimit.ownerExempt;
  if (!skipRateLimit) {
    const r = await input.rateLimiter.check(input.userId, settings.rateLimit, input.now);
    if (!r.allowed) {
      return {
        kind: "rateLimited",
        minutesUntilNextRefill: Math.ceil(r.msUntilNextRefill / 60_000),
      };
    }
  }

  const messages = await buildContext({
    storage: input.storage,
    chatId: input.chatId,
    systemPrompt: settings.systemPrompt,
    userText: input.userText,
    replyTarget: input.replyTarget,
  });

  let result;
  try {
    result = await input.ai.ask({
      model: settings.model,
      messages,
      tools: getAllTools(),
    });
  } catch (err) {
    return { kind: "error", message: err instanceof Error ? err.message : String(err) };
  }

  if (!skipRateLimit) {
    await input.rateLimiter.deduct(input.userId, result.totalTokens);
  }

  let parentBotMsgId: number | null = null;
  if (input.replyTarget) {
    const existing = await input.storage.getConversation(
      input.chatId,
      input.replyTarget.messageId,
    );
    if (existing) parentBotMsgId = input.replyTarget.messageId;
  }

  return {
    kind: "answered",
    text: result.text,
    persistConversation: async (botMsgId) => {
      await input.storage.saveConversation(input.chatId, botMsgId, {
        userQuestion: input.userText,
        botAnswer: result.text,
        parentBotMsgId,
        ts: input.now,
      });
    },
  };
}
```

- [ ] **Step 4: Run tests**

Run: `bun test src/bot/handlers/ask.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/bot/handlers/ask.ts src/bot/handlers/ask.test.ts
git commit -m "feat: add /ask orchestrator"
```

---

## Task 13: `/start` handler (sets owner menu button)

**Files:**
- Create: `src/bot/handlers/start.ts`

- [ ] **Step 1: Implement /start**

Create `src/bot/handlers/start.ts`:
```ts
import type { Context } from "grammy";

export type StartHandlerDeps = {
  ownerId: string;
  webappUrl: string;
};

export function makeStartHandler(deps: StartHandlerDeps) {
  return async (ctx: Context): Promise<void> => {
    const userId = String(ctx.from?.id ?? "");
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return;

    if (userId !== deps.ownerId) {
      await ctx.reply("Hi! This bot is private.");
      return;
    }

    await ctx.api.setChatMenuButton({
      chat_id: chatId,
      menu_button: {
        type: "web_app",
        text: "Admin",
        web_app: { url: deps.webappUrl },
      },
    });
    await ctx.reply(
      "Admin panel installed. Tap the menu button to the left of the message input.",
    );
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `bun typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/bot/handlers/start.ts
git commit -m "feat: add /start handler that installs owner menu button"
```

---

## Task 14: grammY bot wiring

**Files:**
- Create: `src/bot/index.ts`

- [ ] **Step 1: Wire bot**

Create `src/bot/index.ts`:
```ts
import { Bot, type Context } from "grammy";
import type { Storage } from "../storage/types";
import type { RateLimiter } from "../ratelimit/types";
import type { AIClient } from "../ai/types";
import { askHandler } from "./handlers/ask";
import { makeStartHandler } from "./handlers/start";
import type { ReplyTarget } from "./context-builder";

export type BotDeps = {
  botToken: string;
  ownerId: string;
  webappUrl: string;
  storage: Storage;
  rateLimiter: RateLimiter;
  ai: AIClient;
};

export function createBot(deps: BotDeps): Bot {
  const bot = new Bot(deps.botToken);

  bot.command("start", makeStartHandler({ ownerId: deps.ownerId, webappUrl: deps.webappUrl }));

  bot.command("ask", async (ctx) => {
    const userId = String(ctx.from?.id ?? "");
    const chatId = ctx.chat?.id;
    if (!userId || chatId === undefined) return;
    const userText = (ctx.match ?? "").toString().trim();
    const replyTarget = extractReplyTarget(ctx);

    const outcome = await askHandler({
      storage: deps.storage,
      rateLimiter: deps.rateLimiter,
      ai: deps.ai,
      ownerId: deps.ownerId,
      now: Date.now(),
      chatId: String(chatId),
      userId,
      userText,
      replyTarget,
    });

    switch (outcome.kind) {
      case "denied":
        return; // silent
      case "usage":
        await ctx.reply("Usage: /ask <text> or reply to a message with /ask");
        return;
      case "rateLimited":
        await ctx.reply(
          `Rate limit exceeded. Refilled in ~${outcome.minutesUntilNextRefill} min.`,
        );
        return;
      case "error":
        console.error("ask error:", outcome.message);
        await ctx.reply("⚠️ AI error. Try again later.");
        return;
      case "answered": {
        const sent = await ctx.reply(outcome.text, {
          reply_parameters: ctx.message ? { message_id: ctx.message.message_id } : undefined,
        });
        await outcome.persistConversation(sent.message_id);
        return;
      }
    }
  });

  bot.catch((err) => {
    console.error("Unhandled bot error:", err);
  });

  return bot;
}

function extractReplyTarget(ctx: Context): ReplyTarget | null {
  const reply = ctx.message?.reply_to_message;
  if (!reply) return null;
  const text = reply.text ?? reply.caption ?? null;
  return {
    messageId: reply.message_id,
    text,
    authorFirstName: reply.from?.first_name ?? null,
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `bun typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/bot/index.ts
git commit -m "feat: wire grammY bot with /ask and /start handlers"
```

---

## Task 15: Telegram Web App `initData` verification

**Files:**
- Create: `src/webapp/auth.ts`
- Create: `src/webapp/auth.test.ts`

- [ ] **Step 1: Write failing tests**

Note: a known-good fixture is built at test runtime by recomputing the HMAC using the test's bot token. This avoids hand-encoding hashes.

Create `src/webapp/auth.test.ts`:
```ts
import { test, expect, describe } from "bun:test";
import { verifyInitData } from "./auth";

const BOT_TOKEN = "12345:test-token";

async function makeInitData(params: Record<string, string>): Promise<string> {
  const dataCheckString = Object.keys(params)
    .filter((k) => k !== "hash")
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("\n");

  const enc = new TextEncoder();
  const secretKey = await crypto.subtle.importKey(
    "raw",
    enc.encode("WebAppData"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const secret = await crypto.subtle.sign("HMAC", secretKey, enc.encode(BOT_TOKEN));

  const signKey = await crypto.subtle.importKey(
    "raw",
    secret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", signKey, enc.encode(dataCheckString));
  const hash = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");

  const all = { ...params, hash };
  return new URLSearchParams(all).toString();
}

describe("verifyInitData", () => {
  test("accepts valid initData and returns user", async () => {
    const userJson = JSON.stringify({ id: 999, first_name: "Alice" });
    const init = await makeInitData({
      auth_date: String(Math.floor(Date.now() / 1000)),
      user: userJson,
      query_id: "q1",
    });
    const r = await verifyInitData(init, BOT_TOKEN, Date.now());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.user.id).toBe(999);
  });

  test("rejects tampered hash", async () => {
    const userJson = JSON.stringify({ id: 999, first_name: "Alice" });
    const init = await makeInitData({
      auth_date: String(Math.floor(Date.now() / 1000)),
      user: userJson,
    });
    const tampered = init.replace(/hash=[^&]+/, "hash=deadbeef");
    const r = await verifyInitData(tampered, BOT_TOKEN, Date.now());
    expect(r.ok).toBe(false);
  });

  test("rejects expired auth_date", async () => {
    const userJson = JSON.stringify({ id: 999, first_name: "Alice" });
    const old = Math.floor(Date.now() / 1000) - 25 * 3600;
    const init = await makeInitData({ auth_date: String(old), user: userJson });
    const r = await verifyInitData(init, BOT_TOKEN, Date.now());
    expect(r.ok).toBe(false);
  });

  test("rejects when missing user field", async () => {
    const init = await makeInitData({
      auth_date: String(Math.floor(Date.now() / 1000)),
    });
    const r = await verifyInitData(init, BOT_TOKEN, Date.now());
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `bun test src/webapp/auth.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement verification**

Create `src/webapp/auth.ts`:
```ts
export type TelegramUser = {
  id: number;
  first_name?: string;
  username?: string;
};

export type VerifyResult =
  | { ok: true; user: TelegramUser }
  | { ok: false; reason: string };

const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export async function verifyInitData(
  initData: string,
  botToken: string,
  nowMs: number,
): Promise<VerifyResult> {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return { ok: false, reason: "missing hash" };
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");

  const enc = new TextEncoder();
  const secretKey = await crypto.subtle.importKey(
    "raw",
    enc.encode("WebAppData"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const secret = await crypto.subtle.sign("HMAC", secretKey, enc.encode(botToken));
  const signKey = await crypto.subtle.importKey(
    "raw",
    secret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", signKey, enc.encode(dataCheckString));
  const computed = [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (computed !== hash) return { ok: false, reason: "bad hash" };

  const authDate = Number(params.get("auth_date") ?? "0");
  if (!authDate || nowMs - authDate * 1000 > MAX_AGE_MS) {
    return { ok: false, reason: "expired" };
  }

  const userRaw = params.get("user");
  if (!userRaw) return { ok: false, reason: "missing user" };
  let user: TelegramUser;
  try {
    user = JSON.parse(userRaw) as TelegramUser;
  } catch {
    return { ok: false, reason: "bad user json" };
  }
  if (typeof user.id !== "number") return { ok: false, reason: "bad user id" };

  return { ok: true, user };
}
```

- [ ] **Step 4: Run tests**

Run: `bun test src/webapp/auth.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/webapp/auth.ts src/webapp/auth.test.ts
git commit -m "feat: verify Telegram Web App initData"
```

---

## Task 16: Web App REST API handlers (settings / whitelist / ratelimit)

**Files:**
- Create: `src/webapp/api.ts`
- Create: `src/webapp/api.test.ts`

This packs all admin endpoints into one module — they're each a few lines wrapping `Storage`.

- [ ] **Step 1: Write failing tests**

Create `src/webapp/api.test.ts`:
```ts
import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "../storage/memory";
import { TokenBucketLimiter } from "../ratelimit/token-bucket";
import { handleApi } from "./api";
import { DEFAULT_SETTINGS } from "../shared/types";

const ownerId = "1";
function deps() {
  const storage = new MemoryStorage();
  const rateLimiter = new TokenBucketLimiter(storage);
  return { storage, rateLimiter, ownerId };
}

describe("GET /api/settings", () => {
  test("returns defaults when storage empty", async () => {
    const res = await handleApi({ method: "GET", path: "/api/settings", body: null }, deps());
    expect(res.status).toBe(200);
    expect(res.body).toEqual(DEFAULT_SETTINGS);
  });
});

describe("PUT /api/settings", () => {
  test("merges and saves", async () => {
    const d = deps();
    const res = await handleApi(
      {
        method: "PUT",
        path: "/api/settings",
        body: { systemPrompt: "new", model: "openai/gpt-4o" },
      },
      d,
    );
    expect(res.status).toBe(200);
    const saved = await d.storage.getSettings();
    expect(saved?.systemPrompt).toBe("new");
    expect(saved?.model).toBe("openai/gpt-4o");
    expect(saved?.rateLimit).toEqual(DEFAULT_SETTINGS.rateLimit);
  });

  test("can update rateLimit only", async () => {
    const d = deps();
    const res = await handleApi(
      {
        method: "PUT",
        path: "/api/settings",
        body: {
          rateLimit: {
            capacity: 50000,
            refillAmount: 1000,
            refillIntervalMs: 60000,
            ownerExempt: false,
          },
        },
      },
      d,
    );
    expect(res.status).toBe(200);
    const saved = await d.storage.getSettings();
    expect(saved?.rateLimit.capacity).toBe(50000);
    expect(saved?.rateLimit.ownerExempt).toBe(false);
  });
});

describe("whitelist endpoints", () => {
  test("list returns empty initially", async () => {
    const r = await handleApi({ method: "GET", path: "/api/whitelist", body: null }, deps());
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ users: [], chats: [] });
  });

  test("add and list", async () => {
    const d = deps();
    await handleApi(
      { method: "POST", path: "/api/whitelist/users", body: { id: "42", label: "alice" } },
      d,
    );
    const r = await handleApi({ method: "GET", path: "/api/whitelist", body: null }, d);
    expect(r.body).toEqual({ users: [{ id: "42", label: "alice" }], chats: [] });
  });

  test("remove", async () => {
    const d = deps();
    await handleApi(
      { method: "POST", path: "/api/whitelist/chats", body: { id: "-100" } },
      d,
    );
    await handleApi(
      { method: "DELETE", path: "/api/whitelist/chats/-100", body: null },
      d,
    );
    const r = await handleApi({ method: "GET", path: "/api/whitelist", body: null }, d);
    expect(r.body).toEqual({ users: [], chats: [] });
  });
});

describe("ratelimit endpoints", () => {
  test("GET /api/ratelimit/me returns null bucket initially", async () => {
    const r = await handleApi(
      { method: "GET", path: "/api/ratelimit/me", body: null },
      deps(),
    );
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ bucket: null });
  });

  test("PUT /api/ratelimit/me { reset: true } resets owner bucket to capacity", async () => {
    const d = deps();
    await d.storage.saveBucket(ownerId, { tokens: -100, lastRefillTs: 1 });
    const r = await handleApi(
      { method: "PUT", path: "/api/ratelimit/me", body: { reset: true } },
      d,
    );
    expect(r.status).toBe(200);
    const b = await d.storage.getBucket(ownerId);
    expect(b?.tokens).toBe(DEFAULT_SETTINGS.rateLimit.capacity);
  });
});

describe("unknown route", () => {
  test("returns 404", async () => {
    const r = await handleApi({ method: "GET", path: "/api/nope", body: null }, deps());
    expect(r.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `bun test src/webapp/api.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement API**

Create `src/webapp/api.ts`:
```ts
import type { Storage } from "../storage/types";
import type { RateLimiter } from "../ratelimit/types";
import type { Settings, WhitelistEntry } from "../shared/types";
import { getOrInitSettings } from "../settings";

export type ApiRequest = {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  body: unknown;
};

export type ApiResponse = { status: number; body: unknown };

export type ApiDeps = {
  storage: Storage;
  rateLimiter: RateLimiter;
  ownerId: string;
};

export async function handleApi(req: ApiRequest, deps: ApiDeps): Promise<ApiResponse> {
  if (req.path === "/api/settings") {
    if (req.method === "GET") {
      const s = await getOrInitSettings(deps.storage);
      return { status: 200, body: s };
    }
    if (req.method === "PUT") {
      const current = await getOrInitSettings(deps.storage);
      const patch = (req.body ?? {}) as Partial<Settings>;
      const next: Settings = {
        ...current,
        ...patch,
        rateLimit: { ...current.rateLimit, ...(patch.rateLimit ?? {}) },
      };
      await deps.storage.saveSettings(next);
      return { status: 200, body: next };
    }
  }

  if (req.path === "/api/whitelist" && req.method === "GET") {
    const users = await deps.storage.listWhitelist("users");
    const chats = await deps.storage.listWhitelist("chats");
    return { status: 200, body: { users, chats } };
  }

  for (const kind of ["users", "chats"] as const) {
    if (req.path === `/api/whitelist/${kind}` && req.method === "POST") {
      const body = (req.body ?? {}) as Partial<WhitelistEntry>;
      if (typeof body.id !== "string" || body.id.length === 0) {
        return { status: 400, body: { error: "id required" } };
      }
      await deps.storage.addWhitelist(kind, { id: body.id, label: body.label });
      const list = await deps.storage.listWhitelist(kind);
      return { status: 200, body: list };
    }
    const m = req.path.match(new RegExp(`^/api/whitelist/${kind}/(.+)$`));
    if (m && req.method === "DELETE") {
      await deps.storage.removeWhitelist(kind, m[1]!);
      const list = await deps.storage.listWhitelist(kind);
      return { status: 200, body: list };
    }
  }

  if (req.path === "/api/ratelimit/me") {
    if (req.method === "GET") {
      const bucket = await deps.storage.getBucket(deps.ownerId);
      return { status: 200, body: { bucket } };
    }
    if (req.method === "PUT") {
      const settings = await getOrInitSettings(deps.storage);
      const body = (req.body ?? {}) as { reset?: boolean };
      if (body.reset) {
        await deps.rateLimiter.reset(deps.ownerId, settings.rateLimit, Date.now());
      }
      const bucket = await deps.storage.getBucket(deps.ownerId);
      return { status: 200, body: { bucket } };
    }
  }

  return { status: 404, body: { error: "not found" } };
}
```

- [ ] **Step 4: Run tests**

Run: `bun test src/webapp/api.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/webapp/api.ts src/webapp/api.test.ts
git commit -m "feat: add Web App admin REST API"
```

---

## Task 17: Bun.serve server (auth middleware + static SPA + webhook)

**Files:**
- Create: `src/webapp/server.ts`
- Create: `src/webapp/ui/index.html`
- Create: `src/webapp/ui/app.tsx`
- Create: `src/webapp/ui/styles.css`

This task gets a working HTTP server up that serves the SPA shell, accepts authenticated API requests, and routes Telegram webhook traffic. The actual SPA tabs are filled in by Tasks 18–20.

- [ ] **Step 1: Create minimal CSS with Tailwind directive**

Create `src/webapp/ui/styles.css`:
```css
@import "tailwindcss";

body {
  font-family: system-ui, -apple-system, sans-serif;
}
```

- [ ] **Step 2: Create initial SPA shell**

Create `src/webapp/ui/app.tsx`:
```tsx
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type Tab = "prompt" | "model" | "ratelimit" | "whitelist";

function App() {
  const [tab, setTab] = useState<Tab>("prompt");
  const tabs: { id: Tab; label: string }[] = [
    { id: "prompt", label: "Prompt" },
    { id: "model", label: "Model" },
    { id: "ratelimit", label: "Rate Limit" },
    { id: "whitelist", label: "Whitelist" },
  ];
  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Bot Admin</h1>
      <nav className="flex gap-2 mb-4 border-b">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 ${tab === t.id ? "border-b-2 border-blue-500 font-semibold" : ""}`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <section>
        {tab === "prompt" && <div>Prompt editor coming up.</div>}
        {tab === "model" && <div>Model editor coming up.</div>}
        {tab === "ratelimit" && <div>Rate-limit editor coming up.</div>}
        {tab === "whitelist" && <div>Whitelist editor coming up.</div>}
      </section>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
```

- [ ] **Step 3: Create HTML entry**

Create `src/webapp/ui/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Bot Admin</title>
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./app.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Create the server**

Create `src/webapp/server.ts`:
```ts
import { webhookCallback, type Bot } from "grammy";
import { handleApi, type ApiRequest } from "./api";
import { verifyInitData } from "./auth";
import type { Storage } from "../storage/types";
import type { RateLimiter } from "../ratelimit/types";
import indexHtml from "./ui/index.html";

export type ServerDeps = {
  port: number;
  bot: Bot;
  botToken: string;
  ownerId: string;
  webhookUrl: string | undefined;
  storage: Storage;
  rateLimiter: RateLimiter;
};

export function startServer(deps: ServerDeps) {
  const apiDeps = {
    storage: deps.storage,
    rateLimiter: deps.rateLimiter,
    ownerId: deps.ownerId,
  };

  const grammyHandler = deps.webhookUrl
    ? webhookCallback(deps.bot, "std/http")
    : null;

  return Bun.serve({
    port: deps.port,
    routes: {
      "/": indexHtml,
      "/webapp": indexHtml,
      "/webapp/*": indexHtml,
    },
    async fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === "/telegram-webhook" && grammyHandler) {
        return grammyHandler(req);
      }

      if (url.pathname.startsWith("/api/")) {
        const authHeader = req.headers.get("authorization") ?? "";
        const match = authHeader.match(/^tma (.+)$/);
        if (!match) {
          return Response.json({ error: "missing initData" }, { status: 401 });
        }
        const verify = await verifyInitData(match[1]!, deps.botToken, Date.now());
        if (!verify.ok) {
          return Response.json({ error: verify.reason }, { status: 401 });
        }
        if (String(verify.user.id) !== deps.ownerId) {
          return Response.json({ error: "forbidden" }, { status: 403 });
        }

        let body: unknown = null;
        if (req.method !== "GET" && req.method !== "DELETE") {
          try {
            body = await req.json();
          } catch {
            body = null;
          }
        }
        const apiReq: ApiRequest = {
          method: req.method as ApiRequest["method"],
          path: url.pathname,
          body,
        };
        const res = await handleApi(apiReq, apiDeps);
        return Response.json(res.body, { status: res.status });
      }

      return new Response("Not Found", { status: 404 });
    },
  });
}
```

- [ ] **Step 5: Add HTML module type declaration**

Create `src/types/html-modules.d.ts`:
```ts
declare module "*.html" {
  const content: import("bun").HTMLBundle;
  export default content;
}
```

- [ ] **Step 6: Typecheck**

Run: `bun typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/webapp/server.ts src/webapp/ui/index.html src/webapp/ui/app.tsx src/webapp/ui/styles.css src/types/html-modules.d.ts
git commit -m "feat: serve Web App static + REST API + webhook"
```

---

## Task 18: SPA — API client and Prompt + Model tabs

**Files:**
- Create: `src/webapp/ui/api-client.ts`
- Modify: `src/webapp/ui/app.tsx`

- [ ] **Step 1: Create API client**

Create `src/webapp/ui/api-client.ts`:
```ts
import type { Settings, WhitelistEntry, BucketState } from "../../shared/types";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        ready: () => void;
        expand: () => void;
      };
    };
  }
}

function authHeader(): Record<string, string> {
  const initData = window.Telegram?.WebApp?.initData ?? "";
  return { Authorization: `tma ${initData}` };
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { ...authHeader(), "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status}`);
  return (await res.json()) as T;
}

export const api = {
  getSettings: () => req<Settings>("GET", "/api/settings"),
  putSettings: (patch: Partial<Settings>) => req<Settings>("PUT", "/api/settings", patch),
  getWhitelist: () =>
    req<{ users: WhitelistEntry[]; chats: WhitelistEntry[] }>("GET", "/api/whitelist"),
  addWhitelist: (kind: "users" | "chats", entry: WhitelistEntry) =>
    req<WhitelistEntry[]>("POST", `/api/whitelist/${kind}`, entry),
  removeWhitelist: (kind: "users" | "chats", id: string) =>
    req<WhitelistEntry[]>("DELETE", `/api/whitelist/${kind}/${id}`),
  getMyBucket: () => req<{ bucket: BucketState | null }>("GET", "/api/ratelimit/me"),
  resetMyBucket: () =>
    req<{ bucket: BucketState | null }>("PUT", "/api/ratelimit/me", { reset: true }),
};
```

- [ ] **Step 2: Update app.tsx with Prompt + Model tabs**

Replace `src/webapp/ui/app.tsx`:
```tsx
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { api } from "./api-client";
import type { Settings } from "../../shared/types";

type Tab = "prompt" | "model" | "ratelimit" | "whitelist";

function PromptTab({ settings, onSaved }: { settings: Settings; onSaved: (s: Settings) => void }) {
  const [value, setValue] = useState(settings.systemPrompt);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    const next = await api.putSettings({ systemPrompt: value });
    onSaved(next);
    setSaving(false);
  };
  return (
    <div className="space-y-3">
      <label className="block font-semibold">System Prompt</label>
      <textarea
        className="w-full h-48 border rounded p-2 font-mono text-sm"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button
        className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
        disabled={saving}
        onClick={save}
      >
        {saving ? "Saving..." : "Save"}
      </button>
    </div>
  );
}

function ModelTab({ settings, onSaved }: { settings: Settings; onSaved: (s: Settings) => void }) {
  const [value, setValue] = useState(settings.model);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    const next = await api.putSettings({ model: value });
    onSaved(next);
    setSaving(false);
  };
  return (
    <div className="space-y-3">
      <label className="block font-semibold">Model (OpenRouter ID)</label>
      <input
        className="w-full border rounded p-2 font-mono text-sm"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="anthropic/claude-sonnet-4-5"
      />
      <p className="text-sm text-gray-500">
        Examples: anthropic/claude-sonnet-4-5, openai/gpt-4o-mini, google/gemini-pro-1.5
      </p>
      <button
        className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
        disabled={saving}
        onClick={save}
      >
        {saving ? "Saving..." : "Save"}
      </button>
    </div>
  );
}

function App() {
  const [tab, setTab] = useState<Tab>("prompt");
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    window.Telegram?.WebApp?.ready();
    window.Telegram?.WebApp?.expand();
    api.getSettings().then(setSettings);
  }, []);

  if (!settings) return <div className="p-4">Loading...</div>;

  const tabs: { id: Tab; label: string }[] = [
    { id: "prompt", label: "Prompt" },
    { id: "model", label: "Model" },
    { id: "ratelimit", label: "Rate Limit" },
    { id: "whitelist", label: "Whitelist" },
  ];

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Bot Admin</h1>
      <nav className="flex gap-2 mb-4 border-b">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 ${tab === t.id ? "border-b-2 border-blue-500 font-semibold" : ""}`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <section>
        {tab === "prompt" && <PromptTab settings={settings} onSaved={setSettings} />}
        {tab === "model" && <ModelTab settings={settings} onSaved={setSettings} />}
        {tab === "ratelimit" && <div>Rate-limit editor coming up.</div>}
        {tab === "whitelist" && <div>Whitelist editor coming up.</div>}
      </section>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
```

- [ ] **Step 3: Typecheck**

Run: `bun typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/webapp/ui/api-client.ts src/webapp/ui/app.tsx
git commit -m "feat: SPA prompt and model tabs"
```

---

## Task 19: SPA — Rate Limit tab

**Files:**
- Modify: `src/webapp/ui/app.tsx`

- [ ] **Step 1: Add RateLimitTab component**

Insert this block in `src/webapp/ui/app.tsx` above the `App` component:
```tsx
function RateLimitTab({
  settings,
  onSaved,
}: {
  settings: Settings;
  onSaved: (s: Settings) => void;
}) {
  const [capacity, setCapacity] = useState(settings.rateLimit.capacity);
  const [refillAmount, setRefillAmount] = useState(settings.rateLimit.refillAmount);
  const [refillIntervalMin, setRefillIntervalMin] = useState(
    Math.round(settings.rateLimit.refillIntervalMs / 60000),
  );
  const [ownerExempt, setOwnerExempt] = useState(settings.rateLimit.ownerExempt);
  const [bucket, setBucket] = useState<{ tokens: number; lastRefillTs: number } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getMyBucket().then((r) => setBucket(r.bucket));
  }, []);

  const save = async () => {
    setSaving(true);
    const next = await api.putSettings({
      rateLimit: {
        capacity,
        refillAmount,
        refillIntervalMs: refillIntervalMin * 60_000,
        ownerExempt,
      },
    });
    onSaved(next);
    setSaving(false);
  };

  const reset = async () => {
    const r = await api.resetMyBucket();
    setBucket(r.bucket);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="font-semibold">Capacity</span>
          <input
            type="number"
            className="w-full border rounded p-2"
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value))}
          />
        </label>
        <label className="block">
          <span className="font-semibold">Refill amount</span>
          <input
            type="number"
            className="w-full border rounded p-2"
            value={refillAmount}
            onChange={(e) => setRefillAmount(Number(e.target.value))}
          />
        </label>
        <label className="block col-span-2">
          <span className="font-semibold">Refill interval (minutes)</span>
          <input
            type="number"
            className="w-full border rounded p-2"
            value={refillIntervalMin}
            onChange={(e) => setRefillIntervalMin(Number(e.target.value))}
          />
        </label>
        <label className="flex items-center gap-2 col-span-2">
          <input
            type="checkbox"
            checked={ownerExempt}
            onChange={(e) => setOwnerExempt(e.target.checked)}
          />
          <span>Owner exempt from rate limit</span>
        </label>
      </div>
      <button
        className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
        disabled={saving}
        onClick={save}
      >
        {saving ? "Saving..." : "Save"}
      </button>

      <hr />
      <h2 className="font-semibold">My bucket</h2>
      {bucket ? (
        <p>
          Tokens: <b>{bucket.tokens}</b> / {capacity} — last refill{" "}
          {new Date(bucket.lastRefillTs).toLocaleString()}
        </p>
      ) : (
        <p className="text-gray-500">No bucket yet (will be seeded on first /ask).</p>
      )}
      <button
        className="px-4 py-2 bg-gray-200 rounded"
        onClick={reset}
      >
        Reset to capacity
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the App**

In `src/webapp/ui/app.tsx`, replace the line `{tab === "ratelimit" && <div>Rate-limit editor coming up.</div>}` with:
```tsx
{tab === "ratelimit" && <RateLimitTab settings={settings} onSaved={setSettings} />}
```

- [ ] **Step 3: Typecheck**

Run: `bun typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/webapp/ui/app.tsx
git commit -m "feat: SPA rate-limit tab with bucket reset"
```

---

## Task 20: SPA — Whitelist tab

**Files:**
- Modify: `src/webapp/ui/app.tsx`

- [ ] **Step 1: Add WhitelistTab**

Insert above the `App` component in `src/webapp/ui/app.tsx`:
```tsx
import type { WhitelistEntry } from "../../shared/types";

function WhitelistList({
  kind,
  entries,
  onAdd,
  onRemove,
}: {
  kind: "users" | "chats";
  entries: WhitelistEntry[];
  onAdd: (e: WhitelistEntry) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [id, setId] = useState("");
  const [label, setLabel] = useState("");
  const submit = async () => {
    if (!id.trim()) return;
    await onAdd({ id: id.trim(), label: label.trim() || undefined });
    setId("");
    setLabel("");
  };
  return (
    <div className="space-y-2">
      <h3 className="font-semibold capitalize">{kind}</h3>
      <ul className="space-y-1">
        {entries.length === 0 && <li className="text-gray-400 text-sm">empty</li>}
        {entries.map((e) => (
          <li key={e.id} className="flex justify-between border-b py-1">
            <span>
              <code>{e.id}</code>
              {e.label && <span className="ml-2 text-gray-500">{e.label}</span>}
            </span>
            <button
              className="text-red-500 text-sm"
              onClick={() => onRemove(e.id)}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input
          className="border rounded p-2 flex-1"
          placeholder="ID"
          value={id}
          onChange={(e) => setId(e.target.value)}
        />
        <input
          className="border rounded p-2 flex-1"
          placeholder="label (optional)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <button className="px-3 py-2 bg-blue-500 text-white rounded" onClick={submit}>
          Add
        </button>
      </div>
    </div>
  );
}

function WhitelistTab() {
  const [users, setUsers] = useState<WhitelistEntry[]>([]);
  const [chats, setChats] = useState<WhitelistEntry[]>([]);

  useEffect(() => {
    api.getWhitelist().then((d) => {
      setUsers(d.users);
      setChats(d.chats);
    });
  }, []);

  return (
    <div className="space-y-6">
      <WhitelistList
        kind="users"
        entries={users}
        onAdd={async (e) => setUsers(await api.addWhitelist("users", e))}
        onRemove={async (id) => setUsers(await api.removeWhitelist("users", id))}
      />
      <WhitelistList
        kind="chats"
        entries={chats}
        onAdd={async (e) => setChats(await api.addWhitelist("chats", e))}
        onRemove={async (id) => setChats(await api.removeWhitelist("chats", id))}
      />
    </div>
  );
}
```

- [ ] **Step 2: Wire into App**

Replace `{tab === "whitelist" && <div>Whitelist editor coming up.</div>}` with:
```tsx
{tab === "whitelist" && <WhitelistTab />}
```

- [ ] **Step 3: Typecheck**

Run: `bun typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/webapp/ui/app.tsx
git commit -m "feat: SPA whitelist tab"
```

---

## Task 21: Main entry point — wire everything together

**Files:**
- Create: `src/main.ts`
- Delete: `index.ts` (old hello-world)

- [ ] **Step 1: Create main.ts**

Create `src/main.ts`:
```ts
import { loadConfig } from "./config";
import { KeyDBStorage } from "./storage/keydb";
import { TokenBucketLimiter } from "./ratelimit/token-bucket";
import { OpenRouterAIClient } from "./ai/openrouter";
import { registerTool } from "./ai/tools/registry";
import { randomNumberTool } from "./ai/tools/random-number";
import { createBot } from "./bot";
import { startServer } from "./webapp/server";

async function main() {
  const config = loadConfig();

  const storage = await KeyDBStorage.connect(config.keydbUrl);
  const rateLimiter = new TokenBucketLimiter(storage);
  const ai = new OpenRouterAIClient(config.openrouterApiKey);

  registerTool(randomNumberTool);

  const bot = createBot({
    botToken: config.botToken,
    ownerId: config.botOwnerId,
    webappUrl: config.webappUrl,
    storage,
    rateLimiter,
    ai,
  });

  if (config.webhookUrl) {
    await bot.api.setWebhook(`${config.webhookUrl}/telegram-webhook`);
    console.log("Webhook set:", config.webhookUrl);
  } else {
    await bot.api.deleteWebhook();
    bot.start({ drop_pending_updates: true });
    console.log("Bot started in long-polling mode");
  }

  const server = startServer({
    port: config.port,
    bot,
    botToken: config.botToken,
    ownerId: config.botOwnerId,
    webhookUrl: config.webhookUrl,
    storage,
    rateLimiter,
  });
  console.log(`HTTP server listening on :${server.port}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Remove old hello-world**

Run:
```bash
rm index.ts
```

- [ ] **Step 3: Typecheck and run all tests**

Run: `bun typecheck && bun test`
Expected: typecheck clean; all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git rm index.ts
git commit -m "feat: wire main entry point"
```

---

## Task 22: README and integration smoke test

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace README with project setup + run instructions**

Replace `README.md`:
```markdown
# any_talker

Telegram bot with AI integration via OpenRouter.

## Setup

1. Copy `.env.example` to `.env` and fill required vars:
   - `BOT_TOKEN` — from @BotFather
   - `OPENROUTER_API_KEY` — from openrouter.ai
   - `BOT_OWNER_ID` — your Telegram user ID
   - `WEBAPP_URL` — public HTTPS URL where the admin Web App is served (e.g. https://bot.example.com/)
2. Start KeyDB: `docker run -p 6379:6379 eqalpha/keydb`
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
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README with setup and verification checklist"
```

---

## Final verification

- [ ] **Run all tests**

Run: `bun test`
Expected: all tests PASS.

- [ ] **Typecheck**

Run: `bun typecheck`
Expected: no errors.

- [ ] **Boot smoke test (requires KeyDB running and a real bot token)**

Run: `bun run dev`
Expected: console prints `Bot started in long-polling mode` and `HTTP server listening on :3000`. No errors during boot.

- [ ] **Walk through the manual verification checklist in README.md.**
