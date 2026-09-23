// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { afterEach, describe, expect, test } from "bun:test";
import { MemoryStorage } from "../storage/memory";
import { DualWindowLimiter } from "../ratelimit/dual-window";
import { startServer, type ServerDeps } from "./server";
import type { ManagedBotController } from "./api";

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
