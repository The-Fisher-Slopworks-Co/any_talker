// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "../storage/memory";
import { DualWindowLimiter } from "../ratelimit/dual-window";
import { DEFAULT_SETTINGS } from "../shared/types";
import type { UsageStatus } from "../ratelimit/window";
import { handleApi, type ApiDeps } from "./api";

const ownerId = "1";
const owner = { userId: ownerId, isOwner: true };

async function deps(): Promise<ApiDeps & { storage: MemoryStorage }> {
  const storage = new MemoryStorage();
  await storage.users.upsert({
    id: "42",
    firstName: "Alice",
    lastName: null,
    username: null,
    firstSeenAt: 100,
    lastSeenAt: 100,
  });
  return { storage, rateLimiter: new DualWindowLimiter(storage), ownerId };
}

const get = (d: ApiDeps, path: string) =>
  handleApi({ method: "GET", path, body: null }, d, owner);

const putClass = (d: ApiDeps, id: string, body: unknown) =>
  handleApi(
    { method: "PUT", path: `/api/admin/users/${id}/limit-class`, body },
    d,
    owner,
  );

describe("limit class assignment", () => {
  test("the admin puts a user in a class, sees it, and takes them out", async () => {
    const d = await deps();

    expect(await putClass(d, "42", { limitClass: 2 })).toEqual({
      status: 200,
      body: { limitClass: 2 },
    });
    const one = await get(d, "/api/admin/users/42");
    expect((one.body as { limitClass: unknown }).limitClass).toBe(2);
    const list = await get(d, "/api/admin/users");
    expect((list.body as { limitClasses: unknown }).limitClasses).toEqual({
      "42": 2,
    });
    // The admin's view of the user's usage reflects the class (×5 default).
    const usage = await get(d, "/api/ratelimit/user/42");
    expect((usage.body as { usage: UsageStatus }).usage.fiveHour.limit).toBe(
      DEFAULT_SETTINGS.rateLimit.fiveHourTokens * 5,
    );

    expect(await putClass(d, "42", { limitClass: null })).toEqual({
      status: 200,
      body: { limitClass: null },
    });
    expect(await d.storage.limitClasses.get("42")).toBeNull();
  });

  test("rejects an unknown class and an unknown user", async () => {
    const d = await deps();
    for (const limitClass of [0, 3, "1", undefined]) {
      expect((await putClass(d, "42", { limitClass })).status).toBe(400);
    }
    expect((await putClass(d, "999", { limitClass: 1 })).status).toBe(404);
    expect(await d.storage.limitClasses.list()).toEqual([]);
  });

  test("is admin-only", async () => {
    const d = await deps();
    const r = await handleApi(
      {
        method: "PUT",
        path: "/api/admin/users/42/limit-class",
        body: { limitClass: 2 },
      },
      d,
      { userId: "42", isOwner: false },
    );
    expect(r.status).toBe(403);
    expect(await d.storage.limitClasses.get("42")).toBeNull();
  });
});
