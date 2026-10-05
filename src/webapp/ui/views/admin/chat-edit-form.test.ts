// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { DEFAULT_SETTINGS } from "../../../../shared/types";
import {
  chatFormFromSettings,
  chatFormToSave,
  revertFailed,
} from "./chat-edit-form";

const saved = { botName: "Bob", timezone: "Europe/Berlin" };
const form = chatFormFromSettings(saved, DEFAULT_SETTINGS);

describe("chatFormToSave", () => {
  test("sends nothing while the form matches the record", () => {
    expect(chatFormToSave(form, saved)).toBeNull();
  });

  test("sends the whole record once something differs", () => {
    expect(chatFormToSave({ ...form, botName: " Rex " }, saved)).toEqual({
      botName: "Rex",
      timezone: "Europe/Berlin",
    });
  });

  test("an override switched off drops the key from the record", () => {
    expect(chatFormToSave({ ...form, tzOverride: false }, saved)).toEqual({
      botName: "Bob",
    });
  });

  test("keeps the last models while the own-models list is unusable", () => {
    const withModels = { ...saved, models: ["a/b"] };
    const typing = {
      ...chatFormFromSettings(withModels, DEFAULT_SETTINGS),
      botName: "Rex",
      models: ["a/b", "nope"],
      modelsValid: false,
    };
    expect(chatFormToSave(typing, withModels)).toEqual({
      ...withModels,
      botName: "Rex",
    });
  });

  test("leaves models out while they are unusable and were never saved", () => {
    const broken = {
      ...form,
      botName: "Rex",
      modelsOverride: true,
      models: [" "],
    };
    expect(chatFormToSave(broken, saved)).toEqual({
      botName: "Rex",
      timezone: "Europe/Berlin",
    });
    expect(
      chatFormToSave({ ...form, modelsOverride: true, models: [" "] }, saved),
    ).toBeNull();
  });
});

describe("revertFailed", () => {
  test("puts back the fields the refused record changed and no others", () => {
    const failed = { botName: "Rex", timezone: "Asia/Tokyo" };
    const now = {
      ...chatFormFromSettings(failed, DEFAULT_SETTINGS),
      keywordsText: "spam",
    };
    const back = revertFailed(now, failed, saved, DEFAULT_SETTINGS);
    expect(back).toEqual({
      ...chatFormFromSettings(saved, DEFAULT_SETTINGS),
      keywordsText: "spam",
    });
  });

  test("leaves a field typed into again since", () => {
    const failed = { botName: "Rex" };
    const now = {
      ...chatFormFromSettings(failed, DEFAULT_SETTINGS),
      botName: "Rexy",
    };
    const back = revertFailed(now, failed, saved, DEFAULT_SETTINGS);
    expect(back.botName).toBe("Rexy");
  });
});
