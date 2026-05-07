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
const owner = { userId: ownerId, isOwner: true };
const guest = (id: string) => ({ userId: id, isOwner: false });

describe("GET /api/settings", () => {
  test("returns defaults when storage empty", async () => {
    const res = await handleApi({ method: "GET", path: "/api/settings", body: null }, deps(), owner);
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
        body: {
          systemPrompt: "new",
          models: ["openai/gpt-4o", "anthropic/claude-3.5-sonnet"],
        },
      },
      d,
      owner,
    );
    expect(res.status).toBe(200);
    const saved = await d.storage.getSettings();
    expect(saved?.systemPrompt).toBe("new");
    expect(saved?.models).toEqual([
      "openai/gpt-4o",
      "anthropic/claude-3.5-sonnet",
    ]);
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
      owner,
    );
    expect(res.status).toBe(200);
    const saved = await d.storage.getSettings();
    expect(saved?.rateLimit.capacity).toBe(50000);
    expect(saved?.rateLimit.ownerExempt).toBe(false);
  });
});

describe("whitelist endpoints", () => {
  test("list returns empty initially", async () => {
    const r = await handleApi({ method: "GET", path: "/api/whitelist", body: null }, deps(), owner);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ users: [], chats: [] });
  });

  test("add and list", async () => {
    const d = deps();
    await handleApi(
      { method: "POST", path: "/api/whitelist/users", body: { id: "42", label: "alice" } },
      d,
      owner,
    );
    const r = await handleApi({ method: "GET", path: "/api/whitelist", body: null }, d, owner);
    expect(r.body).toEqual({ users: [{ id: "42", label: "alice" }], chats: [] });
  });

  test("remove", async () => {
    const d = deps();
    await handleApi(
      { method: "POST", path: "/api/whitelist/chats", body: { id: "-100" } },
      d,
      owner,
    );
    await handleApi(
      { method: "DELETE", path: "/api/whitelist/chats/-100", body: null },
      d,
      owner,
    );
    const r = await handleApi({ method: "GET", path: "/api/whitelist", body: null }, d, owner);
    expect(r.body).toEqual({ users: [], chats: [] });
  });
});

describe("ratelimit endpoints", () => {
  test("GET /api/ratelimit/me returns null bucket initially", async () => {
    const r = await handleApi(
      { method: "GET", path: "/api/ratelimit/me", body: null },
      deps(),
      owner,
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
      owner,
    );
    expect(r.status).toBe(200);
    const b = await d.storage.getBucket(ownerId);
    expect(b?.tokens).toBe(DEFAULT_SETTINGS.rateLimit.capacity);
  });
});

describe("/api/me", () => {
  test("GET returns null displayName initially and isOwner reflects actor", async () => {
    const d = deps();
    const r = await handleApi(
      { method: "GET", path: "/api/me", body: null },
      d,
      guest("42"),
    );
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ isOwner: false, displayName: null });
  });

  test("PUT writes a name and GET returns it", async () => {
    const d = deps();
    const put = await handleApi(
      { method: "PUT", path: "/api/me", body: { displayName: "  Alice  " } },
      d,
      guest("42"),
    );
    expect(put.body).toEqual({ isOwner: false, displayName: "Alice" });
    const get = await handleApi(
      { method: "GET", path: "/api/me", body: null },
      d,
      guest("42"),
    );
    expect(get.body).toEqual({ isOwner: false, displayName: "Alice" });
  });

  test("PUT empty / whitespace clears the override", async () => {
    const d = deps();
    await d.storage.setUserName("42", "Alice");
    const put = await handleApi(
      { method: "PUT", path: "/api/me", body: { displayName: "   " } },
      d,
      guest("42"),
    );
    expect(put.body).toEqual({ isOwner: false, displayName: null });
    expect(await d.storage.getUserName("42")).toBeNull();
  });

  test("name is stored per-user (not shared)", async () => {
    const d = deps();
    await handleApi(
      { method: "PUT", path: "/api/me", body: { displayName: "Alice" } },
      d,
      guest("42"),
    );
    const r = await handleApi(
      { method: "GET", path: "/api/me", body: null },
      d,
      guest("99"),
    );
    expect(r.body).toEqual({ isOwner: false, displayName: null });
  });
});

describe("/api/admin/users", () => {
  test("GET list returns empty initially", async () => {
    const r = await handleApi(
      { method: "GET", path: "/api/admin/users", body: null },
      deps(),
      owner,
    );
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ users: [] });
  });

  test("GET list returns upserted users sorted by lastSeenAt desc", async () => {
    const d = deps();
    await d.storage.upsertUser({
      id: "10",
      firstName: "Alice",
      lastName: null,
      username: null,
      lastSeenAt: 100,
    });
    await d.storage.upsertUser({
      id: "20",
      firstName: "Bob",
      lastName: null,
      username: "bob",
      lastSeenAt: 200,
    });
    const r = await handleApi(
      { method: "GET", path: "/api/admin/users", body: null },
      d,
      owner,
    );
    const body = r.body as { users: { id: string }[] };
    expect(body.users.map((u) => u.id)).toEqual(["20", "10"]);
  });

  test("GET /api/admin/users/:id returns 404 for unknown", async () => {
    const r = await handleApi(
      { method: "GET", path: "/api/admin/users/999", body: null },
      deps(),
      owner,
    );
    expect(r.status).toBe(404);
  });

  test("PUT /api/admin/users/:id sets displayName for that user", async () => {
    const d = deps();
    await d.storage.upsertUser({
      id: "42",
      firstName: "Alice",
      lastName: null,
      username: null,
      lastSeenAt: 1,
    });
    const r = await handleApi(
      {
        method: "PUT",
        path: "/api/admin/users/42",
        body: { displayName: "  Override  " },
      },
      d,
      owner,
    );
    expect(r.status).toBe(200);
    expect(await d.storage.getUserName("42")).toBe("Override");
  });

  test("PUT empty/whitespace clears displayName", async () => {
    const d = deps();
    await d.storage.upsertUser({
      id: "42",
      firstName: "Alice",
      lastName: null,
      username: null,
      lastSeenAt: 1,
    });
    await d.storage.setUserName("42", "Override");
    const r = await handleApi(
      {
        method: "PUT",
        path: "/api/admin/users/42",
        body: { displayName: "  " },
      },
      d,
      owner,
    );
    expect(r.status).toBe(200);
    expect(await d.storage.getUserName("42")).toBeNull();
  });

  test("non-owner gets 403", async () => {
    const r = await handleApi(
      { method: "GET", path: "/api/admin/users", body: null },
      deps(),
      guest("42"),
    );
    expect(r.status).toBe(403);
  });
});

describe("admin gating", () => {
  test("non-owner gets 403 from /api/settings", async () => {
    const r = await handleApi(
      { method: "GET", path: "/api/settings", body: null },
      deps(),
      guest("42"),
    );
    expect(r.status).toBe(403);
  });

  test("non-owner gets 403 from /api/whitelist", async () => {
    const r = await handleApi(
      { method: "GET", path: "/api/whitelist", body: null },
      deps(),
      guest("42"),
    );
    expect(r.status).toBe(403);
  });

  test("non-owner gets 403 from /api/ratelimit/me", async () => {
    const r = await handleApi(
      { method: "GET", path: "/api/ratelimit/me", body: null },
      deps(),
      guest("42"),
    );
    expect(r.status).toBe(403);
  });
});

describe("unknown route", () => {
  test("returns 404", async () => {
    const r = await handleApi({ method: "GET", path: "/api/nope", body: null }, deps(), owner);
    expect(r.status).toBe(404);
  });
});
