// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "../storage/memory";
import { gatherSpendOverview } from "./overview";
import type { User, Chat, ChatType } from "../shared/types";

const NOW = Date.UTC(2026, 5, 10, 12, 0, 0);
const DAY = 86_400_000;
const OPTS = { limit: 5, newSinceMs: NOW - DAY };

const user = (id: string, username: string): User => ({
  id,
  firstName: null,
  lastName: null,
  username,
  firstSeenAt: 0,
  lastSeenAt: NOW,
});

const chat = (id: string, title: string, type: ChatType = "group"): Chat => ({
  id,
  type,
  title,
  username: null,
  firstSeenAt: 0,
  lastSeenAt: NOW,
});

describe("gatherSpendOverview", () => {
  test("drops rows whose spend has aged out of every window", async () => {
    const storage = new MemoryStorage();
    await storage.upsertUser(user("u1", "spender"));
    await storage.upsertUser(user("u2", "stale"));
    await storage.upsertChat(chat("c1", "live"));
    await storage.upsertChat(chat("c2", "quiet"));

    await storage.addUserSpend("u1", 0.5, NOW);
    await storage.addChatSpend("c1", 0.5, NOW);
    await storage.addModelSpend("vendor/live", 0.5, NOW);
    // Recorded, then aged past the 30-day "month" window: the directory rows
    // and the model set survive, the daily buckets don't.
    await storage.addUserSpend("u2", 0.5, NOW - 40 * DAY);
    await storage.addChatSpend("c2", 0.5, NOW - 40 * DAY);
    await storage.addModelSpend("vendor/stale", 0.5, NOW - 40 * DAY);

    const o = await gatherSpendOverview(storage, NOW, OPTS);
    expect(o.topUsers.map((r) => r.id)).toEqual(["u1"]);
    expect(o.topChats.map((r) => r.id)).toEqual(["c1"]);
    expect(o.models.map((m) => m.modelId)).toEqual(["vendor/live"]);
  });

  test("drops rows too small to render as anything but $0.000000", async () => {
    const storage = new MemoryStorage();
    await storage.upsertUser(user("u1", "dust"));
    await storage.addUserSpend("u1", 1e-9, NOW);
    await storage.addModelSpend("vendor/dust", 1e-9, NOW);

    const o = await gatherSpendOverview(storage, NOW, OPTS);
    expect(o.topUsers).toEqual([]);
    expect(o.models).toEqual([]);
  });

  test("keeps a zero-row model that is flagged unpriced", async () => {
    const storage = new MemoryStorage();
    await storage.addModelSpend("vendor/unpriced", 0.5, NOW - 40 * DAY);
    await storage.flagUnpricedModel("vendor/unpriced");
    await storage.addModelSpend("vendor/stale", 0.5, NOW - 40 * DAY);

    const o = await gatherSpendOverview(storage, NOW, OPTS);
    expect(o.models.map((m) => m.modelId)).toEqual(["vendor/unpriced"]);
    expect(o.models[0]!.unpriced).toBe(true);
  });
});
