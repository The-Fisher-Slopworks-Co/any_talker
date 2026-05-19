// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

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

describe("GET /api/openrouter/endpoints/:permaslug", () => {
  test("calls fetcher and returns endpoints", async () => {
    const calls: string[] = [];
    const fetchOpenRouterStats = async (permaslug: string) => {
      calls.push(permaslug);
      return {
        endpoints: [
          {
            provider_name: "DeepInfra",
            pricing: { prompt: "0.000000039", completion: "0.00000019" },
            throughput: 36,
            latency: 343,
          },
        ],
      };
    };
    const r = await handleApi(
      {
        method: "GET",
        path: "/api/openrouter/endpoints/openai/gpt-oss-120b",
        body: null,
      },
      { ...deps(), fetchOpenRouterStats },
      owner,
    );
    expect(r.status).toBe(200);
    expect(calls).toEqual(["openai/gpt-oss-120b"]);
    expect(r.body).toEqual({
      endpoints: [
        {
          provider_name: "DeepInfra",
          pricing: { prompt: "0.000000039", completion: "0.00000019" },
          throughput: 36,
          latency: 343,
        },
      ],
    });
  });

  test("rejects non-owner with 403", async () => {
    const r = await handleApi(
      {
        method: "GET",
        path: "/api/openrouter/endpoints/openai/gpt-oss-120b",
        body: null,
      },
      deps(),
      guest("99"),
    );
    expect(r.status).toBe(403);
  });

  test("rejects an invalid permaslug with 400", async () => {
    const r = await handleApi(
      {
        method: "GET",
        path: "/api/openrouter/endpoints/<bad>",
        body: null,
      },
      { ...deps(), fetchOpenRouterStats: async () => ({ endpoints: [] }) },
      owner,
    );
    expect(r.status).toBe(400);
  });

  test("returns 502 when the fetcher throws", async () => {
    const r = await handleApi(
      {
        method: "GET",
        path: "/api/openrouter/endpoints/openai/gpt-oss-120b",
        body: null,
      },
      {
        ...deps(),
        fetchOpenRouterStats: async () => {
          throw new Error("upstream down");
        },
      },
      owner,
    );
    expect(r.status).toBe(502);
  });
});

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

  test("accepts a valid providerSort", async () => {
    const d = deps();
    const res = await handleApi(
      {
        method: "PUT",
        path: "/api/settings",
        body: { providerSort: "throughput" },
      },
      d,
      owner,
    );
    expect(res.status).toBe(200);
    expect((await d.storage.getSettings())?.providerSort).toBe("throughput");
  });

  test("accepts null providerSort to clear it", async () => {
    const d = deps();
    await d.storage.saveSettings({
      ...DEFAULT_SETTINGS,
      providerSort: "price",
    });
    const res = await handleApi(
      {
        method: "PUT",
        path: "/api/settings",
        body: { providerSort: null },
      },
      d,
      owner,
    );
    expect(res.status).toBe(200);
    expect((await d.storage.getSettings())?.providerSort).toBeNull();
  });

  test("rejects an invalid providerSort with 400", async () => {
    const d = deps();
    const res = await handleApi(
      {
        method: "PUT",
        path: "/api/settings",
        body: { providerSort: "nope" },
      },
      d,
      owner,
    );
    expect(res.status).toBe(400);
  });

  test("rejects an empty models array with 400", async () => {
    const d = deps();
    const res = await handleApi(
      {
        method: "PUT",
        path: "/api/settings",
        body: { models: [] },
      },
      d,
      owner,
    );
    expect(res.status).toBe(400);
    expect((await d.storage.getSettings())?.models).toEqual(
      DEFAULT_SETTINGS.models,
    );
  });

  test("rejects models that is not an array with 400", async () => {
    const d = deps();
    const res = await handleApi(
      {
        method: "PUT",
        path: "/api/settings",
        body: { models: "openai/gpt-4o" },
      },
      d,
      owner,
    );
    expect(res.status).toBe(400);
  });

  test("rejects models containing a non-string entry with 400", async () => {
    const d = deps();
    const res = await handleApi(
      {
        method: "PUT",
        path: "/api/settings",
        body: { models: ["openai/gpt-4o", 42] },
      },
      d,
      owner,
    );
    expect(res.status).toBe(400);
  });

  test("rejects models containing an empty string with 400", async () => {
    const d = deps();
    const res = await handleApi(
      {
        method: "PUT",
        path: "/api/settings",
        body: { models: ["openai/gpt-4o", "  "] },
      },
      d,
      owner,
    );
    expect(res.status).toBe(400);
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
            detailedMultiplier: 1.5,
            wiseMultiplier: 2.2,
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
    expect(saved?.rateLimit.detailedMultiplier).toBe(1.5);
    expect(saved?.rateLimit.wiseMultiplier).toBe(2.2);
  });

  test("rejects non-positive multipliers", async () => {
    const d = deps();
    const res = await handleApi(
      {
        method: "PUT",
        path: "/api/settings",
        body: { rateLimit: { detailedMultiplier: -1 } },
      },
      d,
      owner,
    );
    expect(res.status).toBe(400);
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
    await d.storage.saveBucket(ownerId, ownerId, { tokens: -100, lastRefillTs: 1 });
    const r = await handleApi(
      { method: "PUT", path: "/api/ratelimit/me", body: { reset: true } },
      d,
      owner,
    );
    expect(r.status).toBe(200);
    const b = await d.storage.getBucket(ownerId, ownerId);
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
    expect(r.body).toEqual({
      isOwner: false,
      displayName: null,
      timezone: null,
      gender: null,
      language: null,
    });
  });

  test("PUT writes a name and GET returns it", async () => {
    const d = deps();
    const put = await handleApi(
      { method: "PUT", path: "/api/me", body: { displayName: "  Alice  " } },
      d,
      guest("42"),
    );
    expect(put.body).toEqual({
      isOwner: false,
      displayName: "Alice",
      timezone: null,
      gender: null,
      language: null,
    });
    const get = await handleApi(
      { method: "GET", path: "/api/me", body: null },
      d,
      guest("42"),
    );
    expect(get.body).toEqual({
      isOwner: false,
      displayName: "Alice",
      timezone: null,
      gender: null,
      language: null,
    });
  });

  test("PUT empty / whitespace clears the override", async () => {
    const d = deps();
    await d.storage.setUserName("42", "Alice");
    const put = await handleApi(
      { method: "PUT", path: "/api/me", body: { displayName: "   " } },
      d,
      guest("42"),
    );
    expect(put.body).toEqual({
      isOwner: false,
      displayName: null,
      timezone: null,
      gender: null,
      language: null,
    });
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
    expect(r.body).toEqual({
      isOwner: false,
      displayName: null,
      timezone: null,
      gender: null,
      language: null,
    });
  });

  test("PUT accepts a valid timezone and persists it", async () => {
    const d = deps();
    const put = await handleApi(
      {
        method: "PUT",
        path: "/api/me",
        body: { displayName: "Alice", timezone: "Europe/Moscow" },
      },
      d,
      guest("42"),
    );
    expect(put.status).toBe(200);
    expect(put.body).toEqual({
      isOwner: false,
      displayName: "Alice",
      timezone: "Europe/Moscow",
      gender: null,
      language: null,
    });
    expect(await d.storage.getUserTimezone("42")).toBe("Europe/Moscow");
  });

  test("PUT rejects an invalid timezone with 400", async () => {
    const d = deps();
    const r = await handleApi(
      {
        method: "PUT",
        path: "/api/me",
        body: { timezone: "Mars/Phobos" },
      },
      d,
      guest("42"),
    );
    expect(r.status).toBe(400);
  });

  test("PUT accepts a valid gender and persists it", async () => {
    const d = deps();
    const put = await handleApi(
      {
        method: "PUT",
        path: "/api/me",
        body: { gender: "female" },
      },
      d,
      guest("42"),
    );
    expect(put.status).toBe(200);
    expect(put.body).toEqual({
      isOwner: false,
      displayName: null,
      timezone: null,
      gender: "female",
      language: null,
    });
    expect(await d.storage.getUserGender("42")).toBe("female");
  });

  test("PUT rejects an invalid gender with 400", async () => {
    const d = deps();
    const r = await handleApi(
      {
        method: "PUT",
        path: "/api/me",
        body: { gender: "other" },
      },
      d,
      guest("42"),
    );
    expect(r.status).toBe(400);
  });

  test("PUT clears gender when null is provided", async () => {
    const d = deps();
    await d.storage.setUserGender("42", "male");
    const r = await handleApi(
      {
        method: "PUT",
        path: "/api/me",
        body: { gender: null },
      },
      d,
      guest("42"),
    );
    expect(r.status).toBe(200);
    expect(await d.storage.getUserGender("42")).toBeNull();
  });

  test("PUT clears timezone when empty string is provided", async () => {
    const d = deps();
    await d.storage.setUserTimezone("42", "Europe/Moscow");
    const r = await handleApi(
      {
        method: "PUT",
        path: "/api/me",
        body: { timezone: "" },
      },
      d,
      guest("42"),
    );
    expect(r.status).toBe(200);
    expect(await d.storage.getUserTimezone("42")).toBeNull();
  });

  test("PUT with only displayName preserves timezone and gender", async () => {
    const d = deps();
    await d.storage.setUserName("42", "OldName");
    await d.storage.setUserTimezone("42", "Europe/Moscow");
    await d.storage.setUserGender("42", "female");
    const r = await handleApi(
      {
        method: "PUT",
        path: "/api/me",
        body: { displayName: "NewName" },
      },
      d,
      guest("42"),
    );
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      isOwner: false,
      displayName: "NewName",
      timezone: "Europe/Moscow",
      gender: "female",
      language: null,
    });
    expect(await d.storage.getUserTimezone("42")).toBe("Europe/Moscow");
    expect(await d.storage.getUserGender("42")).toBe("female");
  });

  test("PUT with only timezone preserves displayName and gender", async () => {
    const d = deps();
    await d.storage.setUserName("42", "Alice");
    await d.storage.setUserGender("42", "male");
    const r = await handleApi(
      {
        method: "PUT",
        path: "/api/me",
        body: { timezone: "America/New_York" },
      },
      d,
      guest("42"),
    );
    expect(r.status).toBe(200);
    expect(await d.storage.getUserName("42")).toBe("Alice");
    expect(await d.storage.getUserGender("42")).toBe("male");
    expect(await d.storage.getUserTimezone("42")).toBe("America/New_York");
  });

  test("PUT with empty body preserves all fields", async () => {
    const d = deps();
    await d.storage.setUserName("42", "Alice");
    await d.storage.setUserTimezone("42", "Europe/Moscow");
    await d.storage.setUserGender("42", "female");
    const r = await handleApi(
      { method: "PUT", path: "/api/me", body: {} },
      d,
      guest("42"),
    );
    expect(r.body).toEqual({
      isOwner: false,
      displayName: "Alice",
      timezone: "Europe/Moscow",
      gender: "female",
      language: null,
    });
  });

  test("PUT accepts a valid language and persists it", async () => {
    const d = deps();
    const r = await handleApi(
      { method: "PUT", path: "/api/me", body: { language: "ru" } },
      d,
      guest("42"),
    );
    expect(r.status).toBe(200);
    expect((r.body as { language: string }).language).toBe("ru");
    expect(await d.storage.getUserLang("42")).toBe("ru");
  });

  test("PUT rejects an invalid language with 400", async () => {
    const d = deps();
    const r = await handleApi(
      { method: "PUT", path: "/api/me", body: { language: "de" } },
      d,
      guest("42"),
    );
    expect(r.status).toBe(400);
  });

  test("PUT clears language when null is provided", async () => {
    const d = deps();
    await d.storage.setUserLang("42", "ru");
    const r = await handleApi(
      { method: "PUT", path: "/api/me", body: { language: null } },
      d,
      guest("42"),
    );
    expect(r.status).toBe(200);
    expect(await d.storage.getUserLang("42")).toBeNull();
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
    expect(r.body).toEqual({ users: [], displayNames: {} });
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

describe("/api/admin/chats", () => {
  test("GET list returns empty initially", async () => {
    const r = await handleApi(
      { method: "GET", path: "/api/admin/chats", body: null },
      deps(),
      owner,
    );
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ chats: [] });
  });

  test("GET list returns upserted chats sorted by lastSeenAt desc", async () => {
    const d = deps();
    await d.storage.upsertChat({
      id: "-100",
      type: "supergroup",
      title: "Old",
      username: null,
      lastSeenAt: 100,
    });
    await d.storage.upsertChat({
      id: "-200",
      type: "group",
      title: "New",
      username: null,
      lastSeenAt: 200,
    });
    const r = await handleApi(
      { method: "GET", path: "/api/admin/chats", body: null },
      d,
      owner,
    );
    const body = r.body as { chats: { id: string }[] };
    expect(body.chats.map((c) => c.id)).toEqual(["-200", "-100"]);
  });

  test("GET /api/admin/chats/:id 404 for unknown", async () => {
    const r = await handleApi(
      { method: "GET", path: "/api/admin/chats/-999", body: null },
      deps(),
      owner,
    );
    expect(r.status).toBe(404);
  });

  test("GET returns empty settings when none set", async () => {
    const d = deps();
    await d.storage.upsertChat({
      id: "-100",
      type: "group",
      title: "T",
      username: null,
      lastSeenAt: 1,
    });
    const r = await handleApi(
      { method: "GET", path: "/api/admin/chats/-100", body: null },
      d,
      owner,
    );
    expect(r.status).toBe(200);
    expect((r.body as { settings: object }).settings).toEqual({});
  });

  test("PUT saves only the override fields, drops invalid models", async () => {
    const d = deps();
    await d.storage.upsertChat({
      id: "-100",
      type: "group",
      title: "T",
      username: null,
      lastSeenAt: 1,
    });
    const r = await handleApi(
      {
        method: "PUT",
        path: "/api/admin/chats/-100",
        body: {
          systemPrompt: "chat-prompt",
          models: [],
          rateLimit: null,
        },
      },
      d,
      owner,
    );
    expect(r.status).toBe(200);
    const saved = await d.storage.getChatSettings("-100");
    expect(saved).toEqual({ systemPrompt: "chat-prompt" });
  });

  test("PUT with all override fields saves all of them", async () => {
    const d = deps();
    await d.storage.upsertChat({
      id: "-100",
      type: "group",
      title: "T",
      username: null,
      lastSeenAt: 1,
    });
    await handleApi(
      {
        method: "PUT",
        path: "/api/admin/chats/-100",
        body: {
          systemPrompt: "p",
          models: ["openai/gpt-4o"],
          rateLimit: {
            capacity: 1,
            refillAmount: 1,
            refillIntervalMs: 1000,
            ownerExempt: false,
            detailedMultiplier: 1.4,
            wiseMultiplier: 2.1,
          },
        },
      },
      d,
      owner,
    );
    const saved = await d.storage.getChatSettings("-100");
    expect(saved).toEqual({
      systemPrompt: "p",
      models: ["openai/gpt-4o"],
      rateLimit: {
        capacity: 1,
        refillAmount: 1,
        refillIntervalMs: 1000,
        ownerExempt: false,
        detailedMultiplier: 1.4,
        wiseMultiplier: 2.1,
      },
    });
  });

  test("PUT trims and saves botName", async () => {
    const d = deps();
    await d.storage.upsertChat({
      id: "-100",
      type: "group",
      title: "T",
      username: null,
      lastSeenAt: 1,
    });
    await handleApi(
      {
        method: "PUT",
        path: "/api/admin/chats/-100",
        body: { botName: "  Helper  " },
      },
      d,
      owner,
    );
    expect(await d.storage.getChatSettings("-100")).toEqual({
      botName: "Helper",
    });
  });

  test("PUT accepts timezone override", async () => {
    const d = deps();
    await d.storage.upsertChat({
      id: "-100",
      type: "group",
      title: "T",
      username: null,
      lastSeenAt: 1,
    });
    await handleApi(
      {
        method: "PUT",
        path: "/api/admin/chats/-100",
        body: { timezone: "Asia/Yekaterinburg" },
      },
      d,
      owner,
    );
    expect(await d.storage.getChatSettings("-100")).toEqual({
      timezone: "Asia/Yekaterinburg",
    });
  });

  test("PUT accepts providerSort string override", async () => {
    const d = deps();
    await d.storage.upsertChat({
      id: "-100",
      type: "group",
      title: "T",
      username: null,
      lastSeenAt: 1,
    });
    await handleApi(
      {
        method: "PUT",
        path: "/api/admin/chats/-100",
        body: { providerSort: "latency" },
      },
      d,
      owner,
    );
    expect(await d.storage.getChatSettings("-100")).toEqual({
      providerSort: "latency",
    });
  });

  test("PUT accepts providerSort=null to override-to-none", async () => {
    const d = deps();
    await d.storage.upsertChat({
      id: "-100",
      type: "group",
      title: "T",
      username: null,
      lastSeenAt: 1,
    });
    await handleApi(
      {
        method: "PUT",
        path: "/api/admin/chats/-100",
        body: { providerSort: null },
      },
      d,
      owner,
    );
    expect(await d.storage.getChatSettings("-100")).toEqual({
      providerSort: null,
    });
  });

  test("PUT silently drops invalid providerSort string", async () => {
    const d = deps();
    await d.storage.upsertChat({
      id: "-100",
      type: "group",
      title: "T",
      username: null,
      lastSeenAt: 1,
    });
    await handleApi(
      {
        method: "PUT",
        path: "/api/admin/chats/-100",
        body: { systemPrompt: "p", providerSort: "fastest" },
      },
      d,
      owner,
    );
    expect(await d.storage.getChatSettings("-100")).toEqual({
      systemPrompt: "p",
    });
  });

  test("PUT silently drops invalid timezone for chat overrides", async () => {
    const d = deps();
    await d.storage.upsertChat({
      id: "-100",
      type: "group",
      title: "T",
      username: null,
      lastSeenAt: 1,
    });
    await handleApi(
      {
        method: "PUT",
        path: "/api/admin/chats/-100",
        body: { systemPrompt: "p", timezone: "Mars/Phobos" },
      },
      d,
      owner,
    );
    expect(await d.storage.getChatSettings("-100")).toEqual({
      systemPrompt: "p",
    });
  });

  test("PUT with whitespace-only botName clears it", async () => {
    const d = deps();
    await d.storage.upsertChat({
      id: "-100",
      type: "group",
      title: "T",
      username: null,
      lastSeenAt: 1,
    });
    await d.storage.saveChatSettings("-100", { botName: "Old" });
    await handleApi(
      {
        method: "PUT",
        path: "/api/admin/chats/-100",
        body: { botName: "   " },
      },
      d,
      owner,
    );
    expect(await d.storage.getChatSettings("-100")).toBeNull();
  });

  test("PUT trims and saves keywordFilter", async () => {
    const d = deps();
    await d.storage.upsertChat({
      id: "-100",
      type: "group",
      title: "T",
      username: null,
      lastSeenAt: 1,
    });
    await handleApi(
      {
        method: "PUT",
        path: "/api/admin/chats/-100",
        body: {
          keywordFilter: { enabled: true, keywords: ["  Foo ", "", "bar"] },
        },
      },
      d,
      owner,
    );
    expect(await d.storage.getChatSettings("-100")).toEqual({
      keywordFilter: { enabled: true, keywords: ["Foo", "bar"] },
    });
  });

  test("PUT keeps keywordFilter when disabled but keywords present", async () => {
    const d = deps();
    await d.storage.upsertChat({
      id: "-100",
      type: "group",
      title: "T",
      username: null,
      lastSeenAt: 1,
    });
    await handleApi(
      {
        method: "PUT",
        path: "/api/admin/chats/-100",
        body: { keywordFilter: { enabled: false, keywords: ["foo"] } },
      },
      d,
      owner,
    );
    expect(await d.storage.getChatSettings("-100")).toEqual({
      keywordFilter: { enabled: false, keywords: ["foo"] },
    });
  });

  test("PUT drops keywordFilter when disabled and keywords empty", async () => {
    const d = deps();
    await d.storage.upsertChat({
      id: "-100",
      type: "group",
      title: "T",
      username: null,
      lastSeenAt: 1,
    });
    await d.storage.saveChatSettings("-100", {
      keywordFilter: { enabled: true, keywords: ["x"] },
    });
    await handleApi(
      {
        method: "PUT",
        path: "/api/admin/chats/-100",
        body: { keywordFilter: { enabled: false, keywords: [] } },
      },
      d,
      owner,
    );
    expect(await d.storage.getChatSettings("-100")).toBeNull();
  });

  test("PUT with empty body clears the chat overrides", async () => {
    const d = deps();
    await d.storage.upsertChat({
      id: "-100",
      type: "group",
      title: "T",
      username: null,
      lastSeenAt: 1,
    });
    await d.storage.saveChatSettings("-100", { systemPrompt: "x" });
    await handleApi(
      { method: "PUT", path: "/api/admin/chats/-100", body: {} },
      d,
      owner,
    );
    expect(await d.storage.getChatSettings("-100")).toBeNull();
  });

  test("non-owner gets 403", async () => {
    const r = await handleApi(
      { method: "GET", path: "/api/admin/chats", body: null },
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

describe("/api/me/reminders", () => {
  test("returns only the actor's reminders, sorted by fireAt asc", async () => {
    const d = deps();
    await d.storage.saveReminder({
      id: "a",
      userId: "42",
      fireAtMs: 200,
      text: "mine-late",
      target: { kind: "guest_dm", userId: "42" },
      createdAtMs: 0,
    });
    await d.storage.saveReminder({
      id: "b",
      userId: "42",
      fireAtMs: 100,
      text: "mine-early",
      target: { kind: "guest_dm", userId: "42" },
      createdAtMs: 0,
    });
    await d.storage.saveReminder({
      id: "c",
      userId: "99",
      fireAtMs: 50,
      text: "other",
      target: { kind: "guest_dm", userId: "99" },
      createdAtMs: 0,
    });
    const r = await handleApi(
      { method: "GET", path: "/api/me/reminders", body: null },
      d,
      guest("42"),
    );
    expect(r.status).toBe(200);
    const out = r.body as {
      reminders: { id: string }[];
      chats: Record<string, unknown>;
    };
    expect(out.reminders.map((x) => x.id)).toEqual(["b", "a"]);
    expect(out.chats).toEqual({});
  });

  test("empty when actor has none", async () => {
    const r = await handleApi(
      { method: "GET", path: "/api/me/reminders", body: null },
      deps(),
      guest("42"),
    );
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ reminders: [], chats: {} });
  });

  test("includes chat metadata for ask_reply targets", async () => {
    const d = deps();
    await d.storage.upsertChat({
      id: "c1",
      type: "supergroup",
      title: "Team Chat",
      username: null,
      lastSeenAt: 1000,
    });
    await d.storage.saveReminder({
      id: "r1",
      userId: "42",
      fireAtMs: 100,
      text: "ping",
      target: { kind: "ask_reply", chatId: "c1", replyToMessageId: 7 },
      createdAtMs: 0,
    });
    const r = await handleApi(
      { method: "GET", path: "/api/me/reminders", body: null },
      d,
      guest("42"),
    );
    expect(r.status).toBe(200);
    const out = r.body as { chats: Record<string, { title: string }> };
    expect(out.chats["c1"]?.title).toBe("Team Chat");
  });
});

describe("/api/admin/reminders", () => {
  test("returns all reminders for owner", async () => {
    const d = deps();
    await d.storage.saveReminder({
      id: "a",
      userId: "42",
      fireAtMs: 200,
      text: "x",
      target: { kind: "guest_dm", userId: "42" },
      createdAtMs: 0,
    });
    await d.storage.saveReminder({
      id: "b",
      userId: "99",
      fireAtMs: 100,
      text: "y",
      target: { kind: "ask_reply", chatId: "c1", replyToMessageId: 7 },
      createdAtMs: 0,
    });
    const r = await handleApi(
      { method: "GET", path: "/api/admin/reminders", body: null },
      d,
      owner,
    );
    expect(r.status).toBe(200);
    const out = r.body as {
      reminders: { id: string }[];
      chats: Record<string, unknown>;
      users: Record<string, unknown>;
    };
    expect(out.reminders.map((x) => x.id)).toEqual(["b", "a"]);
    expect(out.chats).toEqual({});
    expect(out.users).toEqual({});
  });

  test("admin response embeds known user records", async () => {
    const d = deps();
    await d.storage.upsertUser({
      id: "42",
      firstName: "Jane",
      lastName: "Doe",
      username: "jane",
      lastSeenAt: 100,
    });
    await d.storage.saveReminder({
      id: "r1",
      userId: "42",
      fireAtMs: 100,
      text: "x",
      target: { kind: "guest_dm", userId: "42" },
      createdAtMs: 0,
    });
    const r = await handleApi(
      { method: "GET", path: "/api/admin/reminders", body: null },
      d,
      owner,
    );
    const out = r.body as { users: Record<string, { username: string }> };
    expect(out.users["42"]?.username).toBe("jane");
  });

  test("user response does NOT include users field", async () => {
    const d = deps();
    await d.storage.saveReminder({
      id: "r",
      userId: "42",
      fireAtMs: 100,
      text: "x",
      target: { kind: "guest_dm", userId: "42" },
      createdAtMs: 0,
    });
    const r = await handleApi(
      { method: "GET", path: "/api/me/reminders", body: null },
      d,
      guest("42"),
    );
    const out = r.body as Record<string, unknown>;
    expect("users" in out).toBe(false);
  });

  test("non-owner gets 403", async () => {
    const r = await handleApi(
      { method: "GET", path: "/api/admin/reminders", body: null },
      deps(),
      guest("42"),
    );
    expect(r.status).toBe(403);
  });
});

describe("/api/admin/checks", () => {
  const validCheckBody = {
    title: "Sport for Nikita",
    chatId: "-100123456",
    targetUserId: "42",
    targetName: "Nikita",
    scheduleHour: 23,
    scheduleMinute: 30,
    timezone: "Europe/Moscow",
    question: "{name}, sport?",
    yesButton: "Yes",
    noButton: "No",
    yesReply: "{name}, lying. Day {count}",
    noReply: "{name}. Day {count}",
    timeoutMinutes: 25,
    counter: 722,
    counterMode: "always_increment",
    enabled: true,
  };

  test("GET list returns empty initially", async () => {
    const r = await handleApi(
      { method: "GET", path: "/api/admin/checks", body: null },
      deps(),
      owner,
    );
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ checks: [] });
  });

  test("POST creates a check with runtime defaults", async () => {
    const d = deps();
    const r = await handleApi(
      { method: "POST", path: "/api/admin/checks", body: validCheckBody },
      d,
      owner,
    );
    expect(r.status).toBe(200);
    const body = r.body as { check: { id: string; lastFiredAtMs: number } };
    expect(body.check.lastFiredAtMs).toBe(0);
    const list = await d.storage.listChecks();
    expect(list).toHaveLength(1);
    expect(list[0]?.title).toBe("Sport for Nikita");
  });

  test("POST rejects invalid input with 400", async () => {
    const r = await handleApi(
      {
        method: "POST",
        path: "/api/admin/checks",
        body: { ...validCheckBody, scheduleHour: 99 },
      },
      deps(),
      owner,
    );
    expect(r.status).toBe(400);
  });

  test("GET single check returns 404 for unknown id", async () => {
    const r = await handleApi(
      { method: "GET", path: "/api/admin/checks/nope", body: null },
      deps(),
      owner,
    );
    expect(r.status).toBe(404);
  });

  test("GET single check returns the check", async () => {
    const d = deps();
    const create = await handleApi(
      { method: "POST", path: "/api/admin/checks", body: validCheckBody },
      d,
      owner,
    );
    const id = (create.body as { check: { id: string } }).check.id;
    const r = await handleApi(
      { method: "GET", path: `/api/admin/checks/${id}`, body: null },
      d,
      owner,
    );
    expect(r.status).toBe(200);
    const body = r.body as { check: { id: string; title: string } };
    expect(body.check.id).toBe(id);
    expect(body.check.title).toBe("Sport for Nikita");
  });

  test("PUT updates an existing check, preserves runtime state", async () => {
    const d = deps();
    const create = await handleApi(
      { method: "POST", path: "/api/admin/checks", body: validCheckBody },
      d,
      owner,
    );
    const id = (create.body as { check: { id: string } }).check.id;
    const existing = await d.storage.getCheck(id);
    if (!existing) throw new Error("missing");
    await d.storage.saveCheck({
      ...existing,
      pendingMessageId: 99,
      pendingFiredAtMs: 1234,
      lastFiredAtMs: 5678,
    });

    const r = await handleApi(
      {
        method: "PUT",
        path: `/api/admin/checks/${id}`,
        body: { ...validCheckBody, counter: 999 },
      },
      d,
      owner,
    );
    expect(r.status).toBe(200);
    const updated = await d.storage.getCheck(id);
    expect(updated?.counter).toBe(999);
    expect(updated?.pendingMessageId).toBe(99);
    expect(updated?.lastFiredAtMs).toBe(5678);
  });

  test("PUT returns 404 for unknown id", async () => {
    const r = await handleApi(
      {
        method: "PUT",
        path: "/api/admin/checks/nope",
        body: validCheckBody,
      },
      deps(),
      owner,
    );
    expect(r.status).toBe(404);
  });

  test("DELETE removes the check", async () => {
    const d = deps();
    const create = await handleApi(
      { method: "POST", path: "/api/admin/checks", body: validCheckBody },
      d,
      owner,
    );
    const id = (create.body as { check: { id: string } }).check.id;
    const r = await handleApi(
      { method: "DELETE", path: `/api/admin/checks/${id}`, body: null },
      d,
      owner,
    );
    expect(r.status).toBe(200);
    expect(await d.storage.getCheck(id)).toBeNull();
  });

  test("non-owner gets 403", async () => {
    const r = await handleApi(
      { method: "GET", path: "/api/admin/checks", body: null },
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
