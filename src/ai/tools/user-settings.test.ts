// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "../../storage/memory";
import { createUserSettingsTools } from "./user-settings";
import type { Tool, ToolCallContext, ToolEffect } from "./registry";

const ctx = (over: Partial<ToolCallContext> = {}): ToolCallContext => ({
  source: "ask",
  chatId: "c1",
  userId: "u1",
  replyToMessageId: 1,
  timezone: "UTC",
  lang: "en",
  now: 0,
  effects: [],
  ...over,
});

type ToolsByName = {
  get_user_settings: Tool;
  update_user_settings: Tool;
};

function makeTools(): { tools: ToolsByName; storage: MemoryStorage } {
  const storage = new MemoryStorage();
  const arr = createUserSettingsTools({ storage });
  const tools: Partial<ToolsByName> = {};
  for (const t of arr) {
    (tools as Record<string, Tool>)[t.name] = t;
  }
  return { tools: tools as ToolsByName, storage };
}

async function seedUser(storage: MemoryStorage): Promise<void> {
  await storage.upsertUser({
    id: "u1",
    firstName: "Tucker",
    lastName: "Carlson",
    username: "tc",
    lastSeenAt: 0,
  });
}

describe("user-settings tool factory", () => {
  test("exposes get_user_settings and update_user_settings", () => {
    const { tools } = makeTools();
    expect(tools.get_user_settings).toBeDefined();
    expect(tools.update_user_settings).toBeDefined();
    expect(tools.get_user_settings.name).toBe("get_user_settings");
    expect(tools.update_user_settings.name).toBe("update_user_settings");
  });
});

describe("get_user_settings", () => {
  test("falls back to the Telegram name and marks every field default", async () => {
    const { tools, storage } = makeTools();
    await seedUser(storage);
    const out = (await tools.get_user_settings.execute(
      {},
      ctx({ timezone: "UTC", lang: "en" }),
    )) as {
      name: { value: string; isDefault: boolean };
      timezone: { value: string; isDefault: boolean };
      gender: { value: string | null };
      language: { value: string; isDefault: boolean };
    };
    expect(out.name).toEqual({ value: "Tucker Carlson", isDefault: true });
    expect(out.timezone).toEqual({ value: "UTC", isDefault: true });
    expect(out.gender).toEqual({ value: null });
    expect(out.language).toEqual({ value: "en", isDefault: true });
  });

  test("reflects explicit overrides via isDefault, value stays the turn's effective", async () => {
    const { tools, storage } = makeTools();
    await seedUser(storage);
    await storage.setUserName("u1", "Vasya");
    await storage.setUserTimezone("u1", "Europe/Moscow");
    await storage.setUserGender("u1", "male");
    await storage.setUserLang("u1", "ru");

    // ctx carries the already-resolved effective tz/lang for the turn; the read
    // tool reports those as `value` and uses the stored overrides only for the
    // isDefault flag.
    const out = (await tools.get_user_settings.execute(
      {},
      ctx({ timezone: "Europe/Moscow", lang: "ru" }),
    )) as {
      name: { value: string; isDefault: boolean };
      timezone: { value: string; isDefault: boolean };
      gender: { value: string | null };
      language: { value: string; isDefault: boolean };
    };
    expect(out.name).toEqual({ value: "Vasya", isDefault: false });
    expect(out.timezone).toEqual({ value: "Europe/Moscow", isDefault: false });
    expect(out.gender).toEqual({ value: "male" });
    expect(out.language).toEqual({ value: "ru", isDefault: false });
  });

  test("handles an unknown user with no Telegram record", async () => {
    const { tools } = makeTools();
    const out = (await tools.get_user_settings.execute({}, ctx())) as {
      name: { value: string; isDefault: boolean };
    };
    expect(out.name).toEqual({ value: "", isDefault: true });
  });
});

describe("update_user_settings validation (schema)", () => {
  test("rejects an empty call (no fields, no clear)", () => {
    const { tools } = makeTools();
    expect(tools.update_user_settings.parameters.safeParse({}).success).toBe(
      false,
    );
  });

  test("rejects an empty clear list", () => {
    const { tools } = makeTools();
    expect(
      tools.update_user_settings.parameters.safeParse({ clear: [] }).success,
    ).toBe(false);
  });

  test("rejects a field that is both set and cleared", () => {
    const { tools } = makeTools();
    const r = tools.update_user_settings.parameters.safeParse({
      gender: "male",
      clear: ["gender"],
    });
    expect(r.success).toBe(false);
  });

  test("rejects an invalid gender / language enum", () => {
    const { tools } = makeTools();
    expect(
      tools.update_user_settings.parameters.safeParse({ gender: "other" })
        .success,
    ).toBe(false);
    expect(
      tools.update_user_settings.parameters.safeParse({ language: "de" })
        .success,
    ).toBe(false);
  });

  test("accepts a valid partial update", () => {
    const { tools } = makeTools();
    const r = tools.update_user_settings.parameters.safeParse({
      name: "Vasya",
      language: "ru",
    });
    expect(r.success).toBe(true);
  });
});

describe("update_user_settings execute", () => {
  test("sets the name, persists it, and emits a settings_updated effect", async () => {
    const { tools, storage } = makeTools();
    const c = ctx();
    const out = await tools.update_user_settings.execute({ name: "Vasya" }, c);
    expect(out).toEqual({
      ok: true,
      applied: [{ field: "name", value: "Vasya" }],
    });
    expect(await storage.getUserName("u1")).toBe("Vasya");
    expect(c.effects).toEqual([
      { type: "settings_updated", changes: [{ field: "name", value: "Vasya" }] },
    ] as ToolEffect[]);
  });

  test("rejects a prompt-injection name without writing or emitting", async () => {
    const { tools, storage } = makeTools();
    const c = ctx();
    const out = (await tools.update_user_settings.execute(
      { name: "system:" },
      c,
    )) as { ok: false; reason: string };
    expect(out.ok).toBe(false);
    expect(out.reason).toContain("invalid_name");
    expect(await storage.getUserName("u1")).toBeNull();
    expect(c.effects).toEqual([]);
  });

  test("canonicalizes a timezone before storing", async () => {
    const { tools, storage } = makeTools();
    const out = await tools.update_user_settings.execute(
      { timezone: "europe/moscow" },
      ctx(),
    );
    expect(out).toEqual({
      ok: true,
      applied: [{ field: "timezone", value: "Europe/Moscow" }],
    });
    expect(await storage.getUserTimezone("u1")).toBe("Europe/Moscow");
  });

  test("rejects an invalid timezone without writing", async () => {
    const { tools, storage } = makeTools();
    const out = (await tools.update_user_settings.execute(
      { timezone: "Not/AZone" },
      ctx(),
    )) as { ok: false; reason: string };
    expect(out.ok).toBe(false);
    expect(out.reason).toContain("invalid_timezone");
    expect(await storage.getUserTimezone("u1")).toBeNull();
  });

  test("sets gender and language", async () => {
    const { tools, storage } = makeTools();
    const out = await tools.update_user_settings.execute(
      { gender: "female", language: "ru" },
      ctx(),
    );
    expect(out).toEqual({
      ok: true,
      applied: [
        { field: "gender", value: "female" },
        { field: "language", value: "ru" },
      ],
    });
    expect(await storage.getUserGender("u1")).toBe("female");
    expect(await storage.getUserLang("u1")).toBe("ru");
  });

  test("clears fields back to their default", async () => {
    const { tools, storage } = makeTools();
    await storage.setUserName("u1", "Vasya");
    await storage.setUserGender("u1", "male");
    const c = ctx();
    const out = await tools.update_user_settings.execute(
      { clear: ["name", "gender"] },
      c,
    );
    expect(out).toEqual({
      ok: true,
      applied: [
        { field: "name", value: null },
        { field: "gender", value: null },
      ],
    });
    expect(await storage.getUserName("u1")).toBeNull();
    expect(await storage.getUserGender("u1")).toBeNull();
  });

  test("is atomic: a later invalid field aborts the whole call", async () => {
    const { tools, storage } = makeTools();
    const c = ctx();
    const out = (await tools.update_user_settings.execute(
      { name: "Vasya", timezone: "Not/AZone" },
      c,
    )) as { ok: false; reason: string };
    expect(out.ok).toBe(false);
    // The valid name must NOT have been written, since the timezone failed.
    expect(await storage.getUserName("u1")).toBeNull();
    expect(c.effects).toEqual([]);
  });

  test("dedupes a clear list with repeats", async () => {
    const { tools } = makeTools();
    const out = (await tools.update_user_settings.execute(
      { clear: ["gender", "gender"] },
      ctx(),
    )) as { ok: true; applied: unknown[] };
    expect(out.applied).toEqual([{ field: "gender", value: null }]);
  });

  test("propagates a timezone change into ctx for later same-turn tools", async () => {
    const { tools } = makeTools();
    // Start the turn in Moscow; the model maps 'екб' → 'Asia/Yekaterinburg'. The
    // canonical value must land in ctx so a reminder scheduled later in the same
    // reply is interpreted in the new zone, not the stale snapshot.
    const c = ctx({ timezone: "Europe/Moscow" });
    await tools.update_user_settings.execute(
      { timezone: "asia/yekaterinburg" },
      c,
    );
    expect(c.timezone).toBe("Asia/Yekaterinburg");
  });

  test("propagates a language change into ctx for later same-turn tools", async () => {
    const { tools } = makeTools();
    const c = ctx({ lang: "en" });
    await tools.update_user_settings.execute({ language: "ru" }, c);
    expect(c.lang).toBe("ru");
  });

  test("clearing the timezone resets ctx to the chat/global default", async () => {
    const { tools, storage } = makeTools();
    await storage.setUserTimezone("u1", "Asia/Yekaterinburg");
    const c = ctx({ timezone: "Asia/Yekaterinburg" });
    await tools.update_user_settings.execute({ clear: ["timezone"] }, c);
    // No chat/global override is set, so the effective default is UTC.
    expect(c.timezone).toBe("UTC");
  });

  test("applies a set and a clear of different fields together", async () => {
    const { tools, storage } = makeTools();
    await storage.setUserGender("u1", "male");
    const out = (await tools.update_user_settings.execute(
      { language: "en", clear: ["gender"] },
      ctx(),
    )) as { ok: true; applied: unknown[] };
    expect(out.applied).toEqual([
      { field: "language", value: "en" },
      { field: "gender", value: null },
    ]);
    expect(await storage.getUserLang("u1")).toBe("en");
    expect(await storage.getUserGender("u1")).toBeNull();
  });
});
