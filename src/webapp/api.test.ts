// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "../storage/memory";
import { DualWindowLimiter } from "../ratelimit/dual-window";
import { currentWindowStarts } from "../ratelimit/window";
import { handleApi } from "./api";
import { DEFAULT_SETTINGS } from "../shared/types";
import type { UsageStatus } from "../ratelimit/window";
import type { ModelCatalog, ModelInfo } from "../ai/model-catalog";

function fakeCatalog(
  list: () => Promise<ModelInfo[]>,
  unknown?: (ids: string[]) => Promise<string[]>,
): ModelCatalog {
  return {
    list,
    refresh: async () => {},
    getPricing: () => null,
    // By default, derive "unknown" from the same list the catalogue exposes, so
    // a test only has to declare the catalogue once. An empty list means the
    // catalogue is unavailable, which the real implementation treats as
    // "all allowed" — mirror that here.
    unknownModels:
      unknown ??
      (async (ids) => {
        const known = new Set((await list()).map((m) => m.id));
        if (known.size === 0) return [];
        return ids.filter((id) => !known.has(id.trim()));
      }),
  };
}

const ownerId = "1";
function deps() {
  const storage = new MemoryStorage();
  const rateLimiter = new DualWindowLimiter(storage);
  return { storage, rateLimiter, ownerId };
}
const owner = { userId: ownerId, isOwner: true };
const guest = (id: string) => ({ userId: id, isOwner: false });

describe("GET /api/models", () => {
  test("returns the catalogue for the owner", async () => {
    const r = await handleApi(
      { method: "GET", path: "/api/models", body: null },
      { ...deps(), modelCatalog: fakeCatalog(async () => [{ id: "gpt-4o" }]) },
      owner,
    );
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ models: [{ id: "gpt-4o" }] });
  });

  test("is admin-only: a non-owner gets 403", async () => {
    const r = await handleApi(
      { method: "GET", path: "/api/models", body: null },
      { ...deps(), modelCatalog: fakeCatalog(async () => [{ id: "gpt-4o" }]) },
      guest("99"),
    );
    expect(r.status).toBe(403);
  });

  test("returns 503 when no catalogue is configured", async () => {
    const r = await handleApi(
      { method: "GET", path: "/api/models", body: null },
      deps(),
      owner,
    );
    expect(r.status).toBe(503);
  });

  test("returns 502 when the catalogue fetch throws", async () => {
    const r = await handleApi(
      { method: "GET", path: "/api/models", body: null },
      {
        ...deps(),
        modelCatalog: fakeCatalog(async () => {
          throw new Error("upstream down");
        }),
      },
      owner,
    );
    expect(r.status).toBe(502);
  });
});

describe("model validation against the catalogue", () => {
  const catalogOf = (...ids: string[]) =>
    fakeCatalog(async () => ids.map((id) => ({ id })));

  test("PUT /api/settings rejects a model absent from /v1/models", async () => {
    const d = { ...deps(), modelCatalog: catalogOf("gpt-4o") };
    const r = await handleApi(
      { method: "PUT", path: "/api/settings", body: { models: ["made-up"] } },
      d,
      owner,
    );
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: "unknown model", models: ["made-up"] });
    // A rejected write must not touch storage.
    expect((await d.storage.getSettings())?.models).toEqual(
      DEFAULT_SETTINGS.models,
    );
  });

  test("PUT /api/settings accepts a model present in /v1/models", async () => {
    const d = { ...deps(), modelCatalog: catalogOf("gpt-4o", "gpt-4o-mini") };
    const r = await handleApi(
      { method: "PUT", path: "/api/settings", body: { models: ["gpt-4o"] } },
      d,
      owner,
    );
    expect(r.status).toBe(200);
    expect((await d.storage.getSettings())?.models).toEqual(["gpt-4o"]);
  });

  test("PUT /api/settings allows any model when the catalogue is empty", async () => {
    const d = { ...deps(), modelCatalog: catalogOf() };
    const r = await handleApi(
      { method: "PUT", path: "/api/settings", body: { models: ["anything"] } },
      d,
      owner,
    );
    expect(r.status).toBe(200);
    expect((await d.storage.getSettings())?.models).toEqual(["anything"]);
  });

  test("PUT /api/admin/chats/:id rejects an unknown override model", async () => {
    const d = { ...deps(), modelCatalog: catalogOf("gpt-4o") };
    await d.storage.upsertChat({
      id: "-100",
      type: "group",
      title: "T",
      username: null,
      firstSeenAt: 1,
      lastSeenAt: 1,
    });
    const r = await handleApi(
      { method: "PUT", path: "/api/admin/chats/-100", body: { models: ["nope"] } },
      d,
      owner,
    );
    expect(r.status).toBe(400);
    expect(await d.storage.getChatSettings("-100")).toBeNull();
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
            fiveHourTokens: 50000,
            weeklyTokens: 400000,
            ownerExempt: false,
            wiseMultiplier: 2.2,
          },
        },
      },
      d,
      owner,
    );
    expect(res.status).toBe(200);
    const saved = await d.storage.getSettings();
    expect(saved?.rateLimit.fiveHourTokens).toBe(50000);
    expect(saved?.rateLimit.weeklyTokens).toBe(400000);
    expect(saved?.rateLimit.ownerExempt).toBe(false);
    expect(saved?.rateLimit.wiseMultiplier).toBe(2.2);
  });

  test("accepts a valid expandableBlockquoteThreshold", async () => {
    const d = deps();
    const res = await handleApi(
      {
        method: "PUT",
        path: "/api/settings",
        body: { expandableBlockquoteThreshold: 800 },
      },
      d,
      owner,
    );
    expect(res.status).toBe(200);
    expect(
      (await d.storage.getSettings())?.expandableBlockquoteThreshold,
    ).toBe(800);
  });

  test("accepts expandableBlockquoteThreshold of 0", async () => {
    const d = deps();
    const res = await handleApi(
      {
        method: "PUT",
        path: "/api/settings",
        body: { expandableBlockquoteThreshold: 0 },
      },
      d,
      owner,
    );
    expect(res.status).toBe(200);
    expect(
      (await d.storage.getSettings())?.expandableBlockquoteThreshold,
    ).toBe(0);
  });

  test("rejects a negative expandableBlockquoteThreshold", async () => {
    const d = deps();
    const res = await handleApi(
      {
        method: "PUT",
        path: "/api/settings",
        body: { expandableBlockquoteThreshold: -1 },
      },
      d,
      owner,
    );
    expect(res.status).toBe(400);
  });

  test("rejects a non-integer expandableBlockquoteThreshold", async () => {
    const d = deps();
    const res = await handleApi(
      {
        method: "PUT",
        path: "/api/settings",
        body: { expandableBlockquoteThreshold: 12.5 },
      },
      d,
      owner,
    );
    expect(res.status).toBe(400);
  });

  test("rejects a non-numeric expandableBlockquoteThreshold", async () => {
    const d = deps();
    const res = await handleApi(
      {
        method: "PUT",
        path: "/api/settings",
        body: { expandableBlockquoteThreshold: "800" },
      },
      d,
      owner,
    );
    expect(res.status).toBe(400);
  });

  test("accepts a valid maxRemindersPerUser", async () => {
    const d = deps();
    const res = await handleApi(
      {
        method: "PUT",
        path: "/api/settings",
        body: { maxRemindersPerUser: 120 },
      },
      d,
      owner,
    );
    expect(res.status).toBe(200);
    expect((await d.storage.getSettings())?.maxRemindersPerUser).toBe(120);
  });

  test("rejects maxRemindersPerUser below 1", async () => {
    const d = deps();
    const res = await handleApi(
      {
        method: "PUT",
        path: "/api/settings",
        body: { maxRemindersPerUser: 0 },
      },
      d,
      owner,
    );
    expect(res.status).toBe(400);
  });

  test("rejects a non-integer maxRemindersPerUser", async () => {
    const d = deps();
    const res = await handleApi(
      {
        method: "PUT",
        path: "/api/settings",
        body: { maxRemindersPerUser: 12.5 },
      },
      d,
      owner,
    );
    expect(res.status).toBe(400);
  });

  test("rejects non-positive multipliers", async () => {
    const d = deps();
    const res = await handleApi(
      {
        method: "PUT",
        path: "/api/settings",
        body: { rateLimit: { wiseMultiplier: -1 } },
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
  test("GET /api/ratelimit/me returns zeroed usage with the configured limits", async () => {
    const r = await handleApi(
      { method: "GET", path: "/api/ratelimit/me", body: null },
      deps(),
      owner,
    );
    expect(r.status).toBe(200);
    const { usage } = r.body as { usage: UsageStatus };
    expect(usage.fiveHour.used).toBe(0);
    expect(usage.fiveHour.limit).toBe(DEFAULT_SETTINGS.rateLimit.fiveHourTokens);
    expect(usage.weekly.used).toBe(0);
    expect(usage.weekly.limit).toBe(DEFAULT_SETTINGS.rateLimit.weeklyTokens);
  });

  test("PUT /api/ratelimit/me { reset: true } clears the owner's usage", async () => {
    const d = deps();
    const starts = currentWindowStarts(ownerId, Date.now());
    await d.storage.addUserUsage(ownerId, 100, starts.fiveHour, starts.weekly);
    const r = await handleApi(
      { method: "PUT", path: "/api/ratelimit/me", body: { reset: true } },
      d,
      owner,
    );
    expect(r.status).toBe(200);
    expect((r.body as { usage: UsageStatus }).usage.fiveHour.used).toBe(0);
    expect(await d.storage.getUserUsage(ownerId)).toBeNull();
  });

  test("GET /api/ratelimit/user/:id returns that user's usage", async () => {
    const d = deps();
    const starts = currentWindowStarts("42", Date.now());
    await d.storage.addUserUsage("42", 1234, starts.fiveHour, starts.weekly);
    const r = await handleApi(
      { method: "GET", path: "/api/ratelimit/user/42", body: null },
      d,
      owner,
    );
    expect(r.status).toBe(200);
    const { usage } = r.body as { usage: UsageStatus };
    expect(usage.fiveHour.used).toBe(1234);
    expect(usage.weekly.used).toBe(1234);
    expect(usage.fiveHour.remaining).toBe(
      DEFAULT_SETTINGS.rateLimit.fiveHourTokens - 1234,
    );
  });

  test("PUT /api/ratelimit/user/:id { reset: true } clears that user's usage", async () => {
    const d = deps();
    const starts = currentWindowStarts("42", Date.now());
    await d.storage.addUserUsage("42", 5000, starts.fiveHour, starts.weekly);
    const r = await handleApi(
      {
        method: "PUT",
        path: "/api/ratelimit/user/42",
        body: { reset: true },
      },
      d,
      owner,
    );
    expect(r.status).toBe(200);
    expect((r.body as { usage: UsageStatus }).usage.fiveHour.used).toBe(0);
    expect(await d.storage.getUserUsage("42")).toBeNull();
  });

  test("non-owner gets 403 from /api/ratelimit/user/:id", async () => {
    const r = await handleApi(
      { method: "GET", path: "/api/ratelimit/user/42", body: null },
      deps(),
      guest("42"),
    );
    expect(r.status).toBe(403);
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

  test("PUT rejects displayName with newline", async () => {
    const d = deps();
    const r = await handleApi(
      { method: "PUT", path: "/api/me", body: { displayName: "Alice\nBob" } },
      d,
      guest("42"),
    );
    expect(r.status).toBe(400);
    expect(r.body).toEqual({
      error: "invalid display name",
      reason: "multiline",
    });
    expect(await d.storage.getUserName("42")).toBeNull();
  });

  test("PUT rejects displayName over 32 chars", async () => {
    const d = deps();
    const r = await handleApi(
      {
        method: "PUT",
        path: "/api/me",
        body: { displayName: "A".repeat(33) },
      },
      d,
      guest("42"),
    );
    expect(r.status).toBe(400);
    expect(r.body).toEqual({
      error: "invalid display name",
      reason: "too_long",
    });
  });

  test("PUT rejects displayName with prompt-injection token", async () => {
    const d = deps();
    const r = await handleApi(
      {
        method: "PUT",
        path: "/api/me",
        body: { displayName: "<|im_start|>" },
      },
      d,
      guest("42"),
    );
    expect(r.status).toBe(400);
    expect((r.body as { error: string }).error).toBe("invalid display name");
  });

  test("PUT rejects displayName with bidi override", async () => {
    const d = deps();
    const r = await handleApi(
      { method: "PUT", path: "/api/me", body: { displayName: "Alice‮Bob" } },
      d,
      guest("42"),
    );
    expect(r.status).toBe(400);
    expect(r.body).toEqual({
      error: "invalid display name",
      reason: "control_char",
    });
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
    expect(r.body).toEqual({ users: [], displayNames: {}, spending: {} });
  });

  test("GET list returns upserted users sorted by lastSeenAt desc", async () => {
    const d = deps();
    await d.storage.upsertUser({
      id: "10",
      firstName: "Alice",
      lastName: null,
      username: null,
      firstSeenAt: 100,
      lastSeenAt: 100,
    });
    await d.storage.upsertUser({
      id: "20",
      firstName: "Bob",
      lastName: null,
      username: "bob",
      firstSeenAt: 200,
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
      firstSeenAt: 1,
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
      firstSeenAt: 1,
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

  test("GET /api/admin/users/:id returns timezone and gender", async () => {
    const d = deps();
    await d.storage.upsertUser({
      id: "42",
      firstName: "Alice",
      lastName: null,
      username: null,
      firstSeenAt: 1,
      lastSeenAt: 1,
    });
    await d.storage.setUserTimezone("42", "Europe/Moscow");
    await d.storage.setUserGender("42", "female");
    const r = await handleApi(
      { method: "GET", path: "/api/admin/users/42", body: null },
      d,
      owner,
    );
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      displayName: null,
      timezone: "Europe/Moscow",
      gender: "female",
      whitelisted: false,
    });
  });

  test("PUT /api/admin/users/:id sets timezone and gender", async () => {
    const d = deps();
    await d.storage.upsertUser({
      id: "42",
      firstName: "Alice",
      lastName: null,
      username: null,
      firstSeenAt: 1,
      lastSeenAt: 1,
    });
    const r = await handleApi(
      {
        method: "PUT",
        path: "/api/admin/users/42",
        body: { timezone: "Europe/Moscow", gender: "female" },
      },
      d,
      owner,
    );
    expect(r.status).toBe(200);
    expect(await d.storage.getUserTimezone("42")).toBe("Europe/Moscow");
    expect(await d.storage.getUserGender("42")).toBe("female");
  });

  test("PUT null/empty clears timezone and gender", async () => {
    const d = deps();
    await d.storage.upsertUser({
      id: "42",
      firstName: "Alice",
      lastName: null,
      username: null,
      firstSeenAt: 1,
      lastSeenAt: 1,
    });
    await d.storage.setUserTimezone("42", "Europe/Moscow");
    await d.storage.setUserGender("42", "female");
    const r = await handleApi(
      {
        method: "PUT",
        path: "/api/admin/users/42",
        body: { timezone: null, gender: null },
      },
      d,
      owner,
    );
    expect(r.status).toBe(200);
    expect(await d.storage.getUserTimezone("42")).toBeNull();
    expect(await d.storage.getUserGender("42")).toBeNull();
  });

  test("PUT with only displayName preserves timezone and gender", async () => {
    const d = deps();
    await d.storage.upsertUser({
      id: "42",
      firstName: "Alice",
      lastName: null,
      username: null,
      firstSeenAt: 1,
      lastSeenAt: 1,
    });
    await d.storage.setUserTimezone("42", "Europe/Moscow");
    await d.storage.setUserGender("42", "female");
    const r = await handleApi(
      {
        method: "PUT",
        path: "/api/admin/users/42",
        body: { displayName: "NewName" },
      },
      d,
      owner,
    );
    expect(r.status).toBe(200);
    expect(await d.storage.getUserName("42")).toBe("NewName");
    expect(await d.storage.getUserTimezone("42")).toBe("Europe/Moscow");
    expect(await d.storage.getUserGender("42")).toBe("female");
  });

  test("PUT rejects invalid timezone with 400", async () => {
    const d = deps();
    await d.storage.upsertUser({
      id: "42",
      firstName: "Alice",
      lastName: null,
      username: null,
      firstSeenAt: 1,
      lastSeenAt: 1,
    });
    const r = await handleApi(
      {
        method: "PUT",
        path: "/api/admin/users/42",
        body: { timezone: "Not/Real" },
      },
      d,
      owner,
    );
    expect(r.status).toBe(400);
  });

  test("PUT rejects invalid gender with 400", async () => {
    const d = deps();
    await d.storage.upsertUser({
      id: "42",
      firstName: "Alice",
      lastName: null,
      username: null,
      firstSeenAt: 1,
      lastSeenAt: 1,
    });
    const r = await handleApi(
      {
        method: "PUT",
        path: "/api/admin/users/42",
        body: { gender: "other" },
      },
      d,
      owner,
    );
    expect(r.status).toBe(400);
  });

  test("GET /api/admin/users/:id returns language", async () => {
    const d = deps();
    await d.storage.upsertUser({
      id: "42",
      firstName: "Alice",
      lastName: null,
      username: null,
      firstSeenAt: 1,
      lastSeenAt: 1,
    });
    await d.storage.setUserLang("42", "ru");
    const r = await handleApi(
      { method: "GET", path: "/api/admin/users/42", body: null },
      d,
      owner,
    );
    expect(r.status).toBe(200);
    expect((r.body as { language: string | null }).language).toBe("ru");
  });

  test("PUT /api/admin/users/:id sets language for that user", async () => {
    const d = deps();
    await d.storage.upsertUser({
      id: "42",
      firstName: "Alice",
      lastName: null,
      username: null,
      firstSeenAt: 1,
      lastSeenAt: 1,
    });
    const r = await handleApi(
      {
        method: "PUT",
        path: "/api/admin/users/42",
        body: { language: "ru" },
      },
      d,
      owner,
    );
    expect(r.status).toBe(200);
    expect((r.body as { language: string | null }).language).toBe("ru");
    expect(await d.storage.getUserLang("42")).toBe("ru");
  });

  test("PUT null clears language", async () => {
    const d = deps();
    await d.storage.upsertUser({
      id: "42",
      firstName: "Alice",
      lastName: null,
      username: null,
      firstSeenAt: 1,
      lastSeenAt: 1,
    });
    await d.storage.setUserLang("42", "ru");
    const r = await handleApi(
      {
        method: "PUT",
        path: "/api/admin/users/42",
        body: { language: null },
      },
      d,
      owner,
    );
    expect(r.status).toBe(200);
    expect(await d.storage.getUserLang("42")).toBeNull();
  });

  test("PUT rejects invalid language with 400", async () => {
    const d = deps();
    await d.storage.upsertUser({
      id: "42",
      firstName: "Alice",
      lastName: null,
      username: null,
      firstSeenAt: 1,
      lastSeenAt: 1,
    });
    const r = await handleApi(
      {
        method: "PUT",
        path: "/api/admin/users/42",
        body: { language: "de" },
      },
      d,
      owner,
    );
    expect(r.status).toBe(400);
  });

  test("PUT with only language preserves displayName, timezone, and gender", async () => {
    const d = deps();
    await d.storage.upsertUser({
      id: "42",
      firstName: "Alice",
      lastName: null,
      username: null,
      firstSeenAt: 1,
      lastSeenAt: 1,
    });
    await d.storage.setUserName("42", "Override");
    await d.storage.setUserTimezone("42", "Europe/Moscow");
    await d.storage.setUserGender("42", "female");
    const r = await handleApi(
      {
        method: "PUT",
        path: "/api/admin/users/42",
        body: { language: "ru" },
      },
      d,
      owner,
    );
    expect(r.status).toBe(200);
    expect(await d.storage.getUserLang("42")).toBe("ru");
    expect(await d.storage.getUserName("42")).toBe("Override");
    expect(await d.storage.getUserTimezone("42")).toBe("Europe/Moscow");
    expect(await d.storage.getUserGender("42")).toBe("female");
  });

  test("non-owner gets 403", async () => {
    const r = await handleApi(
      { method: "GET", path: "/api/admin/users", body: null },
      deps(),
      guest("42"),
    );
    expect(r.status).toBe(403);
  });

  test("GET list includes a spend summary per user", async () => {
    const d = deps();
    await d.storage.upsertUser({
      id: "42",
      firstName: "Spender",
      lastName: null,
      username: null,
      firstSeenAt: 1,
      lastSeenAt: 1,
    });
    await d.storage.addUserSpend("42", 0.75, Date.now());
    const r = await handleApi(
      { method: "GET", path: "/api/admin/users", body: null },
      d,
      owner,
    );
    const body = r.body as { spending: Record<string, { day: number }> };
    expect(body.spending["42"]!.day).toBeCloseTo(0.75, 6);
  });
});

describe("spending endpoints", () => {
  test("GET /api/me/spending returns the caller's summary", async () => {
    const d = deps();
    await d.storage.addUserSpend("42", 1.5, Date.now());
    const r = await handleApi(
      { method: "GET", path: "/api/me/spending", body: null },
      d,
      guest("42"),
    );
    expect(r.status).toBe(200);
    const body = r.body as { spending: { day: number; month: number } };
    expect(body.spending.day).toBeCloseTo(1.5, 6);
    expect(body.spending.month).toBeCloseTo(1.5, 6);
  });

  test("GET /api/me/spending is zero for a user with no spend", async () => {
    const r = await handleApi(
      { method: "GET", path: "/api/me/spending", body: null },
      deps(),
      guest("99"),
    );
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ spending: { day: 0, week: 0, month: 0 } });
  });

  test("GET /api/admin/users/:id/spending returns that user's summary", async () => {
    const d = deps();
    await d.storage.addUserSpend("42", 2.25, Date.now());
    const r = await handleApi(
      { method: "GET", path: "/api/admin/users/42/spending", body: null },
      d,
      owner,
    );
    expect(r.status).toBe(200);
    const body = r.body as { spending: { day: number } };
    expect(body.spending.day).toBeCloseTo(2.25, 6);
  });

  test("GET /api/admin/users/:id/spending is owner-only", async () => {
    const r = await handleApi(
      { method: "GET", path: "/api/admin/users/42/spending", body: null },
      deps(),
      guest("7"),
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
      firstSeenAt: 100,
      lastSeenAt: 100,
    });
    await d.storage.upsertChat({
      id: "-200",
      type: "group",
      title: "New",
      username: null,
      firstSeenAt: 200,
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
      firstSeenAt: 1,
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
      firstSeenAt: 1,
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
      firstSeenAt: 1,
      lastSeenAt: 1,
    });
    await handleApi(
      {
        method: "PUT",
        path: "/api/admin/chats/-100",
        body: {
          systemPrompt: "p",
          models: ["openai/gpt-4o"],
          // Rate limit is global/per-user now: even if sent, it is not a chat
          // override and must be dropped from the stored chat settings.
          rateLimit: {
            fiveHourTokens: 1,
            weeklyTokens: 1,
            ownerExempt: false,
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
    });
  });

  test("PUT trims and saves botName", async () => {
    const d = deps();
    await d.storage.upsertChat({
      id: "-100",
      type: "group",
      title: "T",
      username: null,
      firstSeenAt: 1,
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
      firstSeenAt: 1,
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

  test("PUT silently drops invalid timezone for chat overrides", async () => {
    const d = deps();
    await d.storage.upsertChat({
      id: "-100",
      type: "group",
      title: "T",
      username: null,
      firstSeenAt: 1,
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
      firstSeenAt: 1,
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
      firstSeenAt: 1,
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
      firstSeenAt: 1,
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
      firstSeenAt: 1,
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
      firstSeenAt: 1,
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
      chatId: "42",
      lang: "en",
      fireAtMs: 200,
      text: "mine-late",
      target: { kind: "guest_dm", userId: "42" },
      createdAtMs: 0,
      contextMessages: [],
    });
    await d.storage.saveReminder({
      id: "b",
      userId: "42",
      chatId: "42",
      lang: "en",
      fireAtMs: 100,
      text: "mine-early",
      target: { kind: "guest_dm", userId: "42" },
      createdAtMs: 0,
      contextMessages: [],
    });
    await d.storage.saveReminder({
      id: "c",
      userId: "99",
      chatId: "99",
      lang: "en",
      fireAtMs: 50,
      text: "other",
      target: { kind: "guest_dm", userId: "99" },
      createdAtMs: 0,
      contextMessages: [],
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
      firstSeenAt: 1000,
      lastSeenAt: 1000,
    });
    await d.storage.saveReminder({
      id: "r1",
      userId: "42",
      chatId: "c1",
      lang: "en",
      fireAtMs: 100,
      text: "ping",
      target: { kind: "ask_reply", chatId: "c1", replyToMessageId: 7 },
      createdAtMs: 0,
      contextMessages: [],
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
      chatId: "42",
      lang: "en",
      fireAtMs: 200,
      text: "x",
      target: { kind: "guest_dm", userId: "42" },
      createdAtMs: 0,
      contextMessages: [],
    });
    await d.storage.saveReminder({
      id: "b",
      userId: "99",
      chatId: "c1",
      lang: "en",
      fireAtMs: 100,
      text: "y",
      target: { kind: "ask_reply", chatId: "c1", replyToMessageId: 7 },
      createdAtMs: 0,
      contextMessages: [],
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
      firstSeenAt: 100,
      lastSeenAt: 100,
    });
    await d.storage.saveReminder({
      id: "r1",
      userId: "42",
      chatId: "42",
      lang: "en",
      fireAtMs: 100,
      text: "x",
      target: { kind: "guest_dm", userId: "42" },
      createdAtMs: 0,
      contextMessages: [],
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
      chatId: "42",
      lang: "en",
      fireAtMs: 100,
      text: "x",
      target: { kind: "guest_dm", userId: "42" },
      createdAtMs: 0,
      contextMessages: [],
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

describe("memory vault (/api/me/bots, /api/me/facts)", () => {
  const charBot = {
    botId: "777",
    ownerUserId: ownerId,
    username: "char_bot",
    displayName: "Кошечка",
    systemPrompt: "secret persona prompt",
    createdAtMs: 1,
  };

  test("GET /api/me/bots returns only the main bot when no characters exist", async () => {
    const r = await handleApi(
      { method: "GET", path: "/api/me/bots", body: null },
      deps(),
      guest("42"),
    );
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      bots: [{ botId: null, displayName: null, username: null }],
    });
  });

  test("GET /api/me/bots lists characters via a narrow DTO (no systemPrompt leak)", async () => {
    const d = deps();
    await d.storage.saveManagedBot(charBot);
    const r = await handleApi(
      { method: "GET", path: "/api/me/bots", body: null },
      d,
      guest("42"),
    );
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      bots: [
        { botId: null, displayName: null, username: null },
        { botId: "777", displayName: "Кошечка", username: "char_bot" },
      ],
    });
  });

  test("GET /api/me/facts/main returns the actor's facts and the cap", async () => {
    const d = deps();
    await d.storage.rememberUserFact("42", "pets", "two cats");
    const r = await handleApi(
      { method: "GET", path: "/api/me/facts/main", body: null },
      d,
      guest("42"),
    );
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      facts: [{ key: "pets", value: "two cats" }],
      cap: 50,
    });
  });

  test("facts are scoped to the actor, never another user", async () => {
    const d = deps();
    await d.storage.rememberUserFact("42", "pets", "two cats");
    const r = await handleApi(
      { method: "GET", path: "/api/me/facts/main", body: null },
      d,
      guest("99"),
    );
    expect((r.body as { facts: unknown[] }).facts).toEqual([]);
  });

  test("an unknown bot scope is 404 on every route", async () => {
    const d = deps();
    for (const req of [
      { method: "GET" as const, path: "/api/me/facts/12345", body: null },
      { method: "POST" as const, path: "/api/me/facts/12345", body: { key: "a", value: "b" } },
      { method: "PUT" as const, path: "/api/me/facts/12345/a", body: { value: "b" } },
      { method: "DELETE" as const, path: "/api/me/facts/12345/a", body: null },
    ]) {
      const r = await handleApi(req, d, guest("42"));
      expect(r.status).toBe(404);
      expect(r.body).toEqual({ error: "bot not found" });
    }
  });

  test("POST creates a fact (key lowercased) and returns the fresh list", async () => {
    const d = deps();
    const r = await handleApi(
      {
        method: "POST",
        path: "/api/me/facts/main",
        body: { key: "Pets", value: "two cats" },
      },
      d,
      guest("42"),
    );
    expect(r.status).toBe(200);
    expect((r.body as { facts: unknown[] }).facts).toEqual([
      { key: "pets", value: "two cats" },
    ]);
  });

  test("POST rejects a malformed key and an oversized value", async () => {
    const d = deps();
    const badKey = await handleApi(
      {
        method: "POST",
        path: "/api/me/facts/main",
        body: { key: "no spaces!", value: "v" },
      },
      d,
      guest("42"),
    );
    expect(badKey.status).toBe(400);
    expect(badKey.body).toEqual({ error: "invalid fact key" });

    const badValue = await handleApi(
      {
        method: "POST",
        path: "/api/me/facts/main",
        body: { key: "ok", value: "x".repeat(501) },
      },
      d,
      guest("42"),
    );
    expect(badValue.status).toBe(400);
    expect(badValue.body).toEqual({ error: "invalid fact value" });
  });

  test("POST with a new key at the cap is rejected and never evicts", async () => {
    const d = deps();
    for (let i = 0; i < 50; i++) {
      await d.storage.rememberUserFact("42", `fact_${i}`, `v${i}`);
    }
    const r = await handleApi(
      {
        method: "POST",
        path: "/api/me/facts/main",
        body: { key: "one_too_many", value: "v" },
      },
      d,
      guest("42"),
    );
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: "limit reached" });
    const facts = await d.storage.listUserFacts("42");
    expect(facts.length).toBe(50);
    expect(facts.some((f) => f.key === "fact_0")).toBe(true);
    expect(facts.some((f) => f.key === "one_too_many")).toBe(false);
  });

  test("POST with an existing key at the cap is an update and allowed", async () => {
    const d = deps();
    for (let i = 0; i < 50; i++) {
      await d.storage.rememberUserFact("42", `fact_${i}`, `v${i}`);
    }
    const r = await handleApi(
      {
        method: "POST",
        path: "/api/me/facts/main",
        body: { key: "fact_7", value: "updated" },
      },
      d,
      guest("42"),
    );
    expect(r.status).toBe(200);
    const facts = (r.body as { facts: Array<{ key: string; value: string }> }).facts;
    expect(facts.length).toBe(50);
    expect(facts.find((f) => f.key === "fact_7")?.value).toBe("updated");
  });

  test("PUT updates the value in place", async () => {
    const d = deps();
    await d.storage.rememberUserFact("42", "pets", "two cats");
    const r = await handleApi(
      {
        method: "PUT",
        path: "/api/me/facts/main/pets",
        body: { value: "three cats" },
      },
      d,
      guest("42"),
    );
    expect(r.status).toBe(200);
    expect((r.body as { facts: unknown[] }).facts).toEqual([
      { key: "pets", value: "three cats" },
    ]);
  });

  test("PUT renames via newKey", async () => {
    const d = deps();
    await d.storage.rememberUserFact("42", "pets", "two cats");
    const r = await handleApi(
      {
        method: "PUT",
        path: "/api/me/facts/main/pets",
        body: { value: "two cats", newKey: "animals" },
      },
      d,
      guest("42"),
    );
    expect(r.status).toBe(200);
    expect((r.body as { facts: unknown[] }).facts).toEqual([
      { key: "animals", value: "two cats" },
    ]);
  });

  test("PUT rename succeeds at exactly the cap (old slot freed first)", async () => {
    const d = deps();
    for (let i = 0; i < 50; i++) {
      await d.storage.rememberUserFact("42", `fact_${i}`, `v${i}`);
    }
    const r = await handleApi(
      {
        method: "PUT",
        path: "/api/me/facts/main/fact_0",
        body: { value: "v0", newKey: "renamed" },
      },
      d,
      guest("42"),
    );
    expect(r.status).toBe(200);
    const facts = (r.body as { facts: Array<{ key: string }> }).facts;
    expect(facts.length).toBe(50);
    expect(facts.some((f) => f.key === "renamed")).toBe(true);
    expect(facts.some((f) => f.key === "fact_0")).toBe(false);
  });

  test("PUT rename onto another existing key is a 409, both facts intact", async () => {
    const d = deps();
    await d.storage.rememberUserFact("42", "pets", "two cats");
    await d.storage.rememberUserFact("42", "job", "welder");
    const r = await handleApi(
      {
        method: "PUT",
        path: "/api/me/facts/main/pets",
        body: { value: "two cats", newKey: "job" },
      },
      d,
      guest("42"),
    );
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ error: "fact key exists" });
    const facts = await d.storage.listUserFacts("42");
    expect(facts).toEqual([
      { key: "job", value: "welder" },
      { key: "pets", value: "two cats" },
    ]);
  });

  test("PUT on a missing fact is 404", async () => {
    const r = await handleApi(
      {
        method: "PUT",
        path: "/api/me/facts/main/nope",
        body: { value: "v" },
      },
      deps(),
      guest("42"),
    );
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: "fact not found" });
  });

  test("DELETE removes a fact and is idempotent", async () => {
    const d = deps();
    await d.storage.rememberUserFact("42", "pets", "two cats");
    const first = await handleApi(
      { method: "DELETE", path: "/api/me/facts/main/pets", body: null },
      d,
      guest("42"),
    );
    expect(first.status).toBe(200);
    expect((first.body as { facts: unknown[] }).facts).toEqual([]);

    const second = await handleApi(
      { method: "DELETE", path: "/api/me/facts/main/pets", body: null },
      d,
      guest("42"),
    );
    expect(second.status).toBe(200);
  });

  test("facts are isolated per character scope", async () => {
    const d = deps();
    await d.storage.saveManagedBot(charBot);
    await handleApi(
      {
        method: "POST",
        path: "/api/me/facts/main",
        body: { key: "main_fact", value: "for the main bot" },
      },
      d,
      guest("42"),
    );
    await handleApi(
      {
        method: "POST",
        path: "/api/me/facts/777",
        body: { key: "char_fact", value: "for the character" },
      },
      d,
      guest("42"),
    );

    const mainList = await handleApi(
      { method: "GET", path: "/api/me/facts/main", body: null },
      d,
      guest("42"),
    );
    expect((mainList.body as { facts: unknown[] }).facts).toEqual([
      { key: "main_fact", value: "for the main bot" },
    ]);

    const charList = await handleApi(
      { method: "GET", path: "/api/me/facts/777", body: null },
      d,
      guest("42"),
    );
    expect((charList.body as { facts: unknown[] }).facts).toEqual([
      { key: "char_fact", value: "for the character" },
    ]);
  });
});

describe("GET /api/admin/spend/overview", () => {
  test("returns the aggregated overview for the owner", async () => {
    const d = deps();
    const now = Date.now();
    await d.storage.addGlobalSpend(2, now);
    await d.storage.addUserSpend("42", 2, now);
    await d.storage.upsertUser({
      id: "42",
      firstName: "A",
      lastName: null,
      username: "aa",
      firstSeenAt: now,
      lastSeenAt: now,
    });
    const r = await handleApi(
      { method: "GET", path: "/api/admin/spend/overview", body: null },
      d,
      owner,
    );
    expect(r.status).toBe(200);
    const body = r.body as {
      global: { day: number };
      topUsers: Array<{ id: string }>;
    };
    expect(body.global.day).toBeCloseTo(2);
    expect(body.topUsers.map((u) => u.id)).toContain("42");
  });

  test("is admin-only: a non-owner gets 403", async () => {
    const r = await handleApi(
      { method: "GET", path: "/api/admin/spend/overview", body: null },
      deps(),
      guest("99"),
    );
    expect(r.status).toBe(403);
  });
});

describe("PUT /api/settings — budget & anomaly", () => {
  test("persists a valid budget patch and preserves the rest", async () => {
    const r = await handleApi(
      {
        method: "PUT",
        path: "/api/settings",
        body: { budget: { globalMonthlyCapUsd: 10 } },
      },
      deps(),
      owner,
    );
    expect(r.status).toBe(200);
    const budget = (r.body as { budget: { globalMonthlyCapUsd: number; enabled: boolean } })
      .budget;
    expect(budget.globalMonthlyCapUsd).toBe(10);
    expect(budget.enabled).toBe(true);
  });

  test("rejects a negative cap", async () => {
    const r = await handleApi(
      {
        method: "PUT",
        path: "/api/settings",
        body: { budget: { globalDailyCapUsd: -1 } },
      },
      deps(),
      owner,
    );
    expect(r.status).toBe(400);
  });

  test("rejects a velocity multiplier below 1", async () => {
    const r = await handleApi(
      {
        method: "PUT",
        path: "/api/settings",
        body: { anomaly: { spikeVelocityMultiplier: 0.5 } },
      },
      deps(),
      owner,
    );
    expect(r.status).toBe(400);
  });
});
