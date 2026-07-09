// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "../storage/types";
import type { SpendSummary } from "./window";
import type { User, Chat, ChatType } from "../shared/types";
import { composeFullName } from "../shared/types";

// Server-side USD formatter for owner DMs (spike alerts + digest). The webapp
// has its own `formatUsd` in `ui/lib/labels.ts` for the browser bundle.
export function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

export type SpendRow = { id: string; label: string; spend: SpendSummary };
export type ModelRow = { modelId: string; spend: SpendSummary; unpriced: boolean };
export type DeniedRow = { userId: string; label: string; count: number };
export type NewEntity = { id: string; label: string; firstSeenAt: number };
export type NewChatEntity = NewEntity & { type: ChatType };

// A cross-cutting snapshot of where the money and the denials are going, shared
// by the periodic owner digest and the admin dashboard endpoint. O(users+chats)
// per call (a per-entity spend read each), matching the existing
// `GET /api/admin/users` fan-out — fine at this bot's scale.
export type SpendOverview = {
  global: SpendSummary;
  topUsers: SpendRow[];
  topChats: SpendRow[];
  models: ModelRow[];
  topDenied: DeniedRow[];
  unpricedModels: string[];
  newUsers: NewEntity[];
  newChats: NewChatEntity[];
};

// Best-effort display label from the directory record alone (no extra async
// name lookups): a username, else the full name, else the raw id.
export function userLabel(u: User): string {
  if (u.username) return `@${u.username}`;
  return composeFullName(u.firstName, u.lastName) || u.id;
}

export function chatLabel(c: Chat): string {
  return c.title ?? (c.username ? `@${c.username}` : c.id);
}

const byMonthThenDay = (a: SpendRow, b: SpendRow): number =>
  b.spend.month - a.spend.month || b.spend.day - a.spend.day;

export async function gatherSpendOverview(
  storage: Storage,
  nowMs: number,
  opts: { limit: number; newSinceMs: number },
): Promise<SpendOverview> {
  const [users, chats, modelIds, unpricedModels, denied, global] =
    await Promise.all([
      storage.listUsers(),
      storage.listChats(),
      storage.listSpendModels(),
      storage.listUnpricedModels(),
      storage.topDenied(nowMs, opts.limit),
      storage.getGlobalSpend(nowMs),
    ]);

  const [userSpends, chatSpends, modelSpends] = await Promise.all([
    Promise.all(users.map((u) => storage.getUserSpend(u.id, nowMs))),
    Promise.all(chats.map((c) => storage.getChatSpend(c.id, nowMs))),
    Promise.all(modelIds.map((m) => storage.getModelSpend(m, nowMs))),
  ]);

  const topUsers = users
    .map((u, i): SpendRow => ({ id: u.id, label: userLabel(u), spend: userSpends[i]! }))
    .filter((r) => r.spend.month > 0)
    .sort(byMonthThenDay)
    .slice(0, opts.limit);

  const topChats = chats
    .map((c, i): SpendRow => ({ id: c.id, label: chatLabel(c), spend: chatSpends[i]! }))
    .filter((r) => r.spend.month > 0)
    .sort(byMonthThenDay)
    .slice(0, opts.limit);

  const unpricedSet = new Set(unpricedModels);
  const models = modelIds
    .map(
      (m, i): ModelRow => ({
        modelId: m,
        spend: modelSpends[i]!,
        unpriced: unpricedSet.has(m),
      }),
    )
    .sort((a, b) => b.spend.month - a.spend.month)
    .slice(0, opts.limit);

  const userById = new Map(users.map((u) => [u.id, u]));
  const topDenied = denied.map((d): DeniedRow => {
    const u = userById.get(d.userId);
    return { userId: d.userId, label: u ? userLabel(u) : d.userId, count: d.count };
  });

  // Legacy rows carry firstSeenAt 0 (never "new"); the filter excludes them.
  const isNew = (firstSeenAt: number) =>
    firstSeenAt > 0 && firstSeenAt >= opts.newSinceMs;
  const newUsers = users
    .filter((u) => isNew(u.firstSeenAt))
    .map((u): NewEntity => ({ id: u.id, label: userLabel(u), firstSeenAt: u.firstSeenAt }));
  const newChats = chats
    .filter((c) => isNew(c.firstSeenAt))
    .map(
      (c): NewChatEntity => ({
        id: c.id,
        label: chatLabel(c),
        type: c.type,
        firstSeenAt: c.firstSeenAt,
      }),
    );

  return {
    global,
    topUsers,
    topChats,
    models,
    topDenied,
    unpricedModels,
    newUsers,
    newChats,
  };
}
