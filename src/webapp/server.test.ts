// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { afterEach, describe, expect, test } from "bun:test";
import { MemoryStorage } from "../storage/memory";
import { DualWindowLimiter } from "../ratelimit/dual-window";
import { startServer, type ServerDeps } from "./server";
import type { ManagedBotController } from "./api";
import { hashApiToken } from "./auth";

const OWNER_ID = "42";

const botManager: ManagedBotController = {
  isRunning: () => false,
  setAvatar: async () => false,
  deleteBot: async () => {},
  syncProfileName: async () => {},
  managerInfo: async () => ({ username: null, canManageBots: false }),
};

let server: ReturnType<typeof startServer> | null = null;

afterEach(() => {
  server?.stop(true);
  server = null;
});

function start(extra: Partial<ServerDeps> = {}) {
  const storage = new MemoryStorage();
  server = startServer({
    port: 0,
    botToken: "123:test",
    ownerId: OWNER_ID,
    storage,
    rateLimiter: new DualWindowLimiter(storage),
    botManager,
    ...extra,
  });
  return `http://localhost:${server.port}`;
}

describe("startServer auth", () => {
  test("rejects an API call without initData", async () => {
    const base = start();
    const res = await fetch(`${base}/api/me`);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "missing initData" });
  });

  test("demoUserId serves the owner without initData", async () => {
    const base = start({ demoUserId: OWNER_ID });
    const me = await fetch(`${base}/api/me`);
    expect(me.status).toBe(200);
    expect(((await me.json()) as { isOwner: boolean }).isOwner).toBe(true);
    // The admin surface is open too, since the demo user is the owner.
    const settings = await fetch(`${base}/api/settings`);
    expect(settings.status).toBe(200);
  });

  test("demoUserId other than the owner stays a regular user", async () => {
    const base = start({ demoUserId: "7" });
    const me = await fetch(`${base}/api/me`);
    expect(me.status).toBe(200);
    expect(((await me.json()) as { isOwner: boolean }).isOwner).toBe(false);
    const settings = await fetch(`${base}/api/settings`);
    expect(settings.status).toBe(403);
  });
});

describe("startServer admin API token", () => {
  const bearer = (token: string) => ({
    headers: { Authorization: `Bearer ${token}` },
  });

  test("the stored token opens the admin API as the owner", async () => {
    const storage = new MemoryStorage();
    await storage.apiToken.save({
      hash: await hashApiToken("secret"),
      createdAt: 1,
    });
    const base = start({ storage });
    const res = await fetch(`${base}/api/admin/feedback`, bearer("secret"));
    expect(res.status).toBe(200);
    const me = await fetch(`${base}/api/me`, bearer("secret"));
    expect(((await me.json()) as { isOwner: boolean }).isOwner).toBe(true);
  });

  test("rejects a wrong token", async () => {
    const storage = new MemoryStorage();
    await storage.apiToken.save({
      hash: await hashApiToken("secret"),
      createdAt: 1,
    });
    const base = start({ storage });
    const res = await fetch(`${base}/api/admin/feedback`, bearer("guess"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "bad api token" });
  });

  test("rejects every token once it is deleted", async () => {
    const storage = new MemoryStorage();
    await storage.apiToken.save({
      hash: await hashApiToken("secret"),
      createdAt: 1,
    });
    await storage.apiToken.clear();
    const base = start({ storage });
    const res = await fetch(`${base}/api/admin/feedback`, bearer("secret"));
    expect(res.status).toBe(401);
  });
});
