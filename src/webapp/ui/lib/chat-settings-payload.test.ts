// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import {
  buildChatSettingsPayload,
  type ChatSettingsDraft,
} from "./chat-settings-payload";

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
    );
    expect(out).toEqual({
      systemPrompt: "p",
      models: ["m"],
      botName: "Bot",
      timezone: "Europe/Moscow",
    });
  });

  test("an override toggled off drops the field, which deletes it on save", () => {
    const out = buildChatSettingsPayload(draft());
    expect(out).toEqual({});
  });

  test("an empty model list is not written even with the override on", () => {
    const out = buildChatSettingsPayload(
      draft({ modelsOverride: true, models: [] }),
    );
    expect(out.models).toBeUndefined();
  });

  test("the keyword filter is written whenever it is enabled or has words", () => {
    expect(
      buildChatSettingsPayload(draft({ kfEnabled: true })).keywordFilter,
    ).toEqual({ enabled: true, keywords: [] });
    expect(
      buildChatSettingsPayload(draft({ keywords: ["a"] })).keywordFilter,
    ).toEqual({ enabled: false, keywords: ["a"] });
    expect(buildChatSettingsPayload(draft()).keywordFilter).toBeUndefined();
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
    );
    expect(out.providerSort).toBe("price");
    expect(out.provider).toBe("deepinfra");
    expect(out.serviceTier).toBe("flex");
  });

  test("an explicit null override is written, not skipped", () => {
    const out = buildChatSettingsPayload(
      draft({ provOverride: true, provValue: null }),
    );
    expect(out).toHaveProperty("provider", null);
  });

  test("turning an override off removes it", () => {
    const out = buildChatSettingsPayload(draft());
    expect(out).toEqual({});
  });
});
