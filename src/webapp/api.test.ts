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
