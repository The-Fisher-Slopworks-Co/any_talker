<!--
SPDX-License-Identifier: AGPL-3.0-or-later
Copyright (C) 2026 The Fisher Slopworks Co
-->

# Architecture review — 2026-07-13

Point-in-time review of architectural friction; line numbers reference the tree
at commit `964356e`. Vocabulary: **module**, **interface**, **implementation**,
**depth** (deep = simple interface hiding a lot of implementation; shallow =
interface nearly as complex as the implementation), **seam** (substitution
point), **adapter** (implementation of a seam), **leverage** (one interface,
many call sites), **locality** (bugs concentrate in one module, not in wiring).

**Headline:** the pure computational modules (routing cluster, handlers,
schedulers, spend math) are deep and well-tested. The friction concentrates in
the *wiring* — duplicated orchestration with no interface and no tests.

| # | Candidate | Strength |
|---|---|---|
| 1 | Collapse the ask/guest dispatch pipeline | Strong |
| 2 | One turn-runner interface for the three LLM call sites | Strong — **top recommendation** |
| 3 | Contract-test the Storage seam; narrow its ports | Strong |
| 4 | Per-resource modules behind `handleApi` | Worth exploring |
| 5 | Scope tools behind the registry; effects out of the mutable bag | Worth exploring |
| 6 | One definition for the reminder wire shape | Speculative |

## 1. Collapse the ask/guest dispatch pipeline — Strong

**Files:** `src/bot/index.ts` (`dispatchGuest` 463–682, `dispatchAsk` 714–909),
`src/bot/reply.ts`, `src/bot/reply-images.ts`.

**Problem.** `createBot` is a ~970-line closure; the two dispatchers write the
ask-turn / guest-query lifecycle out longhand twice (~70% shared). Evidence:

- Reply-voice download+transcode copied byte-identically (guest 576–587, ask
  758–777), comment included.
- Reply-target + reply-image resolution duplicated (guest 563–574, ask 734–747).
- Sender resolution duplicated verbatim (guest 544–553, ask 779–788).
- Metrics timing wrapper duplicated, differing only in the `source` label.
- Outcome switch (`denied/budgetLimited/rateLimited/error/answered`) parallel;
  divergence only at the send primitive and persistence call.
- `grep createBot|dispatchAsk|dispatchGuest` over `*.test.ts` = **zero hits** —
  the dispatchers are entirely untested; wiring bugs have no locality.
- Handler interfaces are wide: `AskInput` 23 fields, `GuestAskInput` 22.
- `reply.ts` / `reply-images.ts` are single-caller splinters (deletion test:
  just move complexity); `photo.ts` / `context-builder.ts` / `transcode.ts` /
  `media-group-buffer.ts` are genuinely deep.
- `rich.ts` is a 13-line file wrapping one type cast.

**Solution.** Deepen into one turn-pipeline module (resolve reply context +
media, build sender, run handler, outcome switch, persist + metrics) behind a
send seam with two adapters: rich reply (`sendRichMessage` + fallback) and
guest answer (`answerGuestQuery`). Fold in `reply.ts`/`reply-images.ts`.

**Wins:** wiring bugs land in one tested module; two adapters justify the send
seam; the copy-pasted transcode stage is deleted; dispatchers reduce to grammY
glue; tests substitute a fake send adapter.

## 2. One turn-runner interface for the three LLM call sites — Strong

**Files:** `src/bot/handlers/ask.ts:228–281`, `src/bot/handlers/guest.ts:182–230`,
`src/reminders/delivery.ts:176–218`.

**Problem.** "Assemble AI request → `ai.ask` → `rateLimiter.deduct` →
`recordSpend`" is hand-written three times:

- Each caller builds the same 6-field `ask()` opts: `buildInstruction(...)`,
  `getAllTools()`, an 11-field `toolCallContext` literal, models, reasoning.
- Each repeats the post-call accounting: owner-exempt `deduct`, then
  `recordSpend(storage, { userId, chatId, modelId: r.modelId ?? null, costUsd:
  r.costUsd ?? 0, priced: r.priced ?? true }, now)` with best-effort
  `.catch(console.error)` — the same `??` defaults written out three times.
- The accounting contract is enforced by convention, not by an interface: a
  context-shape or contract change touches all three call sites.
- `reminders/delivery.ts:14–15` imports `bot/format` + `bot/rich` — a
  scheduler-layer module depending on bot presentation across the seam.
- Three near-identical hand-rolled `FakeAI` test doubles (ask/guest/delivery
  test files).
- Adjacent gap: `ai/compat-client.ts:ask()` itself has no test (only
  `computeCostUsd` is covered).

**Solution.** A deep turn-runner module (`runAiTurn`) owning instruction build,
tool wiring, `ToolCallContext` construction (incl. the effects array), the
`ai.ask` call, token deduction, and the four-ledger spend booking. Callers pass
domain inputs; get back `{ text, effects, tokens, cost }`.

**Wins:** leverage — one interface, three call sites; accounting bugs gain
locality; context changes touch one file; one shared AI fake; a seam to test
the SDK adapter behind.

## 3. Contract-test the Storage seam; narrow its ports — Strong

**Files:** `src/storage/types.ts` (76 methods), `src/storage/keydb.ts` (903
lines), `src/storage/memory.ts` (700 lines).

**Problem.** The one real ports-&-adapters seam is the widest and least
verified interface in the codebase:

- 76 methods across ~17 unrelated entity families in one flat bag; the
  interface hides almost nothing the adapters don't expose 1:1 (shallow per
  method). Adding an entity touches 3 files in lockstep.
- Narrow consumers receive full width: `budget/guard.ts` uses 4 methods,
  `checks/runner.ts` 2, `spending/record.ts` 5, `reminders/delivery.ts` 3.
  Every *other* seam in the repo is narrowed (`ReminderApi`, `CheckApi`,
  `NotifyApi`, `ManagedBotController`, `PriceLookup`) — `Storage` is the
  exception.
- `forBot` scoping policy is encoded twice, independently, per adapter
  (`keydb.ts:168–179` vs `memory.ts:144–166`).
- `keydb.ts` has **no behavioral test** (only `parseRememberFactReply`, a pure
  helper). No test imports both adapters — zero cross-adapter verification;
  "MemoryStorage mirrors KeyDB" is documentation, not a test.

**Solution.** One contract suite run against both adapters (memory in-process;
KeyDB behind a disposable instance), then carve narrow ports (`SpendStore`,
`ReminderStore`, `ConversationStore`, …) for the 2–5-method consumers.

**Wins:** keydb gains its first behavioral tests; adapter drift becomes a
failing test; consumers state their true interface; scoping checked once.

## 4. Per-resource modules behind `handleApi` — Worth exploring

**Files:** `src/webapp/api.ts:416–1065`.

**Problem.** `handleApi` is one ~650-line function: 26 inline route conditions;
the two-tier auth model is a single statement's *position* in the file
(`api.ts:601 if (!actor.isOwner) return FORBIDDEN`) — a user route pasted below
it silently becomes owner-only. Validation is 100% hand-rolled (0 Zod) while
the tool layer validates the same shapes with Zod; the settings PUT
(`622–700`) is ~80 lines of manual field checks and hand-rolls a nested
write-merge (`692–698`) that bypasses `normalize()`. `api.test.ts` is 2,448
lines (well-covered), but `webapp/server.ts` has no test.

**Solution.** A route table with per-resource modules (settings, chats,
memory vault, character bots, budget); each declares its auth tier and owns its
validation, sharing the tool layer's Zod schemas.

**Wins:** auth tier becomes structure, not position; one resource = one module
= one test file; validation shapes defined once.

## 5. Scope tools behind the registry; effects out of the mutable bag — Worth exploring

**Files:** `src/ai/tools/registry.ts`, `user-settings.ts`, `reminders/*`,
`src/bot/format.ts`.

**Problem.**

- `ToolCallContext` is a 10-field bag handed to every tool; 6 tools ignore it
  entirely; `contextMessages` exists for exactly one tool.
- Per-character scoping is re-derived by hand at **7** `forBot(ctx.botId ??
  null)` call sites across the tools — forget one and a character bot writes
  into another's namespace; no locality.
- `update_user_settings` mutates `ctx.timezone`/`ctx.lang` mid-turn (a
  deliberate, documented channel — but a hidden one).
- `ToolEffect` — a presentation concern — is defined in the AI layer, pushed by
  tools into a mutable out-param array, and consumed by `bot/format.ts`: the
  ai→bot seam leaks both directions.
- The registry singleton forces `_resetRegistryForTest()` (called 18× in
  `delivery.test.ts`).

**Solution.** The registry (or the candidate-2 turn runner) resolves the scoped
storage once and hands each tool a narrow context; effects return in the ask
result. Keep the mid-turn tz write-back as explicit turn state owned by one
module.

**Wins:** scoping is one seam, not 7 call sites; tool interfaces shrink; the
effects leak becomes a plain return value; the singleton stops leaking into
tests.

## 6. One definition for the reminder wire shape — Speculative

**Files:** `src/ai/types.ts:16–23`, `src/ai/serialize.ts`,
`src/reminders/parse.ts:26–63`.

**Problem.** The serialized message shape reminders persist is declared twice —
a TS type (`SerializedAIMessage`) in the AI layer and a Zod
`discriminatedUnion` in `reminders/parse.ts` — kept in sync by hand; add a
media part type and both (plus `serialize.ts`'s exhaustive switch) must change.

**Solution.** One Zod schema as source; type via `z.infer`; codec and
stored-record validator import the same definition.

## Noted, not carded

- `ai/compat-client.ts:ask()` — the SDK adapter (message mapping, tool loop,
  reasoning-effort trick) is untested; candidate 2 creates the seam to test it
  behind.
- `bot/rich.ts` — 13-line one-cast file; folds into candidate 1's send adapter.
- Day-bucket key strings (`…:{YYYY-MM-DD}` claim/bucket keys) are re-formatted
  inline in `keydb.ts`, `observability/scheduler.ts:85`, and
  `bot/index.ts:421` — a convention three subsystems must agree on by hand
  (the date *math* itself is centralized in `spending/window.ts`).
- `main.ts:127–145` — the native character-bot-creation handler lives in the
  composition root instead of `BotManager`, untestable there; plus the
  forward-declared `let botManager` closure hack (89–102) to break the
  bot↔manager cycle.
- Settings resolution is clean (single-source merge in `settings.ts`); only the
  api.ts PUT write-merge duplicates nesting knowledge.

## Top recommendation

**Candidate 2** — the smallest Strong change and the safest first move: the
code it collapses already sits under 1,900+ lines of handler tests, unlike
candidate 1's dispatchers (zero coverage to refactor against). It converges
three call sites onto one deep interface, gives the accounting contract
locality, and lays the floor candidates 1 and 5 build on.
