// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "../../storage/memory";
import { DualWindowLimiter } from "../../ratelimit/dual-window";
import { handleApi } from "../api";
import { verifyApiToken } from "../auth";
import type { ApiRequest } from "./types";

const ownerId = "1";
const owner = { userId: ownerId, isOwner: true };
const guest = { userId: "99", isOwner: false };

function deps() {
  const storage = new MemoryStorage();
  return { storage, rateLimiter: new DualWindowLimiter(storage), ownerId };
}

function call(method: ApiRequest["method"]): ApiRequest {
  return { method, path: "/api/admin/api-token", body: null };
}

describe("admin API token routes", () => {
  test("reports no token before one is created", async () => {
    const res = await handleApi(call("GET"), deps(), owner);
    expect(res).toEqual({ status: 200, body: { createdAt: null } });
  });

  test("create returns the token once and stores only its hash", async () => {
    const d = deps();
    const res = await handleApi(call("POST"), d, owner);
    const body = res.body as { token: string; createdAt: number };
    expect(res.status).toBe(200);
    expect(body.token).toMatch(/^[0-9a-f]{64}$/);

    const stored = await d.storage.apiToken.get();
    expect(stored?.hash).not.toBe(body.token);
    expect(await verifyApiToken(body.token, stored!.hash)).toBe(true);

    const read = await handleApi(call("GET"), d, owner);
    expect(read.body).toEqual({ createdAt: body.createdAt });
  });

  test("creating again replaces the previous token", async () => {
    const d = deps();
    const first = (await handleApi(call("POST"), d, owner)).body as {
      token: string;
    };
    const second = (await handleApi(call("POST"), d, owner)).body as {
      token: string;
    };
    const stored = await d.storage.apiToken.get();
    expect(await verifyApiToken(first.token, stored!.hash)).toBe(false);
    expect(await verifyApiToken(second.token, stored!.hash)).toBe(true);
  });

  test("delete removes the token", async () => {
    const d = deps();
    await handleApi(call("POST"), d, owner);
    const res = await handleApi(call("DELETE"), d, owner);
    expect(res.status).toBe(200);
    expect(await d.storage.apiToken.get()).toBeNull();
  });

  test("is owner-only", async () => {
    const d = deps();
    for (const method of ["GET", "POST", "DELETE"] as const) {
      expect((await handleApi(call(method), d, guest)).status).toBe(403);
    }
    expect(await d.storage.apiToken.get()).toBeNull();
  });
});
