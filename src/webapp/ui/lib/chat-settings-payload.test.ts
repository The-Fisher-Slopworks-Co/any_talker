// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { capabilitiesFor } from "../../../ai/provider-profile";
import {
  buildChatSettingsPayload,
  type ChatSettingsDraft,
} from "./chat-settings-payload";

const OPENROUTER = capabilitiesFor("openrouter");
const GENERIC = capabilitiesFor("generic");

const draft = (over: Partial<ChatSettingsDraft> = {}): ChatSettingsDraft => ({
  promptOverride: false,
  promptValue: "",
  modelsOverride: false,
  models: [],
  botName: "",
  tzOverride: false,
  tzValue: "UTC",
  psOverride: false,
  psValue: null,
  provOverride: false,
  provValue: null,
  stOverride: false,
  stValue: null,
  kfEnabled: false,
  keywords: [],
  ...over,
});

describe("buildChatSettingsPayload — the non-routing fields", () => {
  test("writes only the fields whose override is on", () => {
    const out = buildChatSettingsPayload(
      draft({
        promptOverride: true,
        promptValue: "p",
        modelsOverride: true,
        models: ["m"],
        botName: "Bot",
        tzOverride: true,
        tzValue: "Europe/Moscow",
      }),
      GENERIC,
      {},
    );
    expect(out).toEqual({
      systemPrompt: "p",
      models: ["m"],
      botName: "Bot",
      timezone: "Europe/Moscow",
    });
  });

  test("an override toggled off drops the field, which deletes it on save", () => {
    const out = buildChatSettingsPayload(draft(), GENERIC, {
      systemPrompt: "old",
      timezone: "Asia/Tokyo",
    });
    expect(out).toEqual({});
  });

  test("an empty model list is not written even with the override on", () => {
    const out = buildChatSettingsPayload(
      draft({ modelsOverride: true, models: [] }),
      GENERIC,
      {},
    );
    expect(out.models).toBeUndefined();
  });

  test("the keyword filter is written whenever it is enabled or has words", () => {
    expect(
      buildChatSettingsPayload(draft({ kfEnabled: true }), GENERIC, {})
        .keywordFilter,
    ).toEqual({ enabled: true, keywords: [] });
    expect(
      buildChatSettingsPayload(draft({ keywords: ["a"] }), GENERIC, {})
        .keywordFilter,
    ).toEqual({ enabled: false, keywords: ["a"] });
    expect(
      buildChatSettingsPayload(draft(), GENERIC, {}).keywordFilter,
    ).toBeUndefined();
  });
});

describe("buildChatSettingsPayload — routing", () => {
  test("writes routing the endpoint can honour", () => {
    const out = buildChatSettingsPayload(
      draft({
        psOverride: true,
        psValue: "price",
        provOverride: true,
        provValue: "deepinfra",
        stOverride: true,
        stValue: "flex",
      }),
      OPENROUTER,
      {},
    );
    expect(out.providerSort).toBe("price");
    expect(out.provider).toBe("deepinfra");
    expect(out.serviceTier).toBe("flex");
  });

  test("an explicit null override is written, not skipped", () => {
    const out = buildChatSettingsPayload(
      draft({ provOverride: true, provValue: null }),
      OPENROUTER,
      { provider: "deepinfra" },
    );
    expect(out).toHaveProperty("provider", null);
  });

  test("turning an override off removes it", () => {
    const out = buildChatSettingsPayload(draft(), OPENROUTER, {
      providerSort: "price",
      provider: "deepinfra",
      serviceTier: "flex",
    });
    expect(out).toEqual({});
  });

  // The route replaces the whole record. With routing unsupported the section
  // isn't rendered, so saving any other field would otherwise wipe overrides the
  // admin never saw — and which work again on a routing-capable endpoint.
  test("carries stored routing through untouched when unsupported", () => {
    const out = buildChatSettingsPayload(
      draft({ promptOverride: true, promptValue: "p" }),
      GENERIC,
      { providerSort: "price", provider: "deepinfra", serviceTier: "flex" },
    );
    expect(out).toEqual({
      systemPrompt: "p",
      providerSort: "price",
      provider: "deepinfra",
      serviceTier: "flex",
    });
  });

  test("preserves a stored explicit null when unsupported", () => {
    const out = buildChatSettingsPayload(draft(), GENERIC, { provider: null });
    expect(out).toHaveProperty("provider", null);
  });

  test("invents nothing when unsupported and nothing was stored", () => {
    expect(buildChatSettingsPayload(draft(), GENERIC, {})).toEqual({});
  });

  // Guards against a half-fix: the two routing capabilities are independent.
  test("carries only the fields whose capability is off", () => {
    const routingOnly = { ...OPENROUTER, serviceTier: false };
    const out = buildChatSettingsPayload(
      draft({ psOverride: true, psValue: "latency" }),
      routingOnly,
      { providerSort: "price", serviceTier: "priority" },
    );
    expect(out.providerSort).toBe("latency");
    expect(out.serviceTier).toBe("priority");
  });
});
