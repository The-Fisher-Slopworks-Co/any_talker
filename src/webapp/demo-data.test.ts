// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { beforeAll, describe, expect, test } from "bun:test";
import { MemoryStorage } from "../storage/memory";
import { DualWindowLimiter } from "../ratelimit/dual-window";
import { handleApi, type ApiDeps } from "./api";
import { seedDemoData } from "./demo-data";

const ids = { ownerId: "1", userId: "2" };
const NOW = Date.UTC(2026, 8, 23, 12, 0);

let deps: ApiDeps;

beforeAll(async () => {
  const storage = new MemoryStorage();
  const rateLimiter = new DualWindowLimiter(storage);
  await seedDemoData(storage, rateLimiter, ids, NOW);
  deps = { storage, rateLimiter, ownerId: ids.ownerId };
});

async function get(path: string, userId: string) {
  const res = await handleApi({ method: "GET", path, body: null }, deps, {
    userId,
    isOwner: userId === ids.ownerId,
  });
  expect(res.status).toBe(200);
  return res.body as Record<string, unknown[]>;
}

describe("seedDemoData", () => {
  test.each([
    ["/api/admin/users", "users"],
    ["/api/admin/chats", "chats"],
    ["/api/admin/reminders", "reminders"],
    ["/api/admin/checks", "checks"],
    ["/api/admin/feedback", "entries"],
    ["/api/admin/managed-bots", "bots"],
  ])("fills the owner's %s", async (path, key) => {
    const body = await get(path, ids.ownerId);
    expect(body[key]!.length).toBeGreaterThan(0);
  });

  test("fills the demo user's own screens", async () => {
    const reminders = await get("/api/me/reminders", ids.userId);
    expect(reminders.reminders!.length).toBeGreaterThan(0);
    const facts = await get("/api/me/facts/main", ids.userId);
    expect(facts.facts!.length).toBeGreaterThan(0);
  });
});
