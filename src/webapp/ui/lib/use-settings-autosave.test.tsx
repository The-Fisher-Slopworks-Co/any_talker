// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { DEFAULT_SETTINGS } from "../../../shared/types";
import { renderToStaticMarkup } from "react-dom/server";
import {
  applyPatch,
  revertPatch,
  useSettingsAutosave,
} from "./use-settings-autosave";

describe("applyPatch", () => {
  test("merges a grouped setting field by field", () => {
    const next = applyPatch(DEFAULT_SETTINGS, { budget: { enabled: false } });
    expect(next.budget.enabled).toBe(false);
    expect(next.budget.globalMonthlyCapUsd).toBe(
      DEFAULT_SETTINGS.budget.globalMonthlyCapUsd,
    );
  });

  test("replaces a plain setting and leaves the input untouched", () => {
    const next = applyPatch(DEFAULT_SETTINGS, { models: ["a/b"] });
    expect(next.models).toEqual(["a/b"]);
    expect(DEFAULT_SETTINGS.models).not.toEqual(["a/b"]);
  });
});

describe("revertPatch", () => {
  test("puts back only the fields the rejected patch named", () => {
    const rejected = { budget: { globalDailyCapUsd: 99 } };
    const draft = applyPatch(DEFAULT_SETTINGS, {
      budget: { globalDailyCapUsd: 99, perChatDailyCapUsd: 7 },
    });
    const next = revertPatch(draft, DEFAULT_SETTINGS, rejected);
    expect(next.budget.globalDailyCapUsd).toBe(
      DEFAULT_SETTINGS.budget.globalDailyCapUsd,
    );
    expect(next.budget.perChatDailyCapUsd).toBe(7);
  });

  test("puts back a plain setting", () => {
    const draft = applyPatch(DEFAULT_SETTINGS, { models: ["a/b"] });
    const next = revertPatch(draft, DEFAULT_SETTINGS, { models: ["a/b"] });
    expect(next.models).toEqual(DEFAULT_SETTINGS.models);
  });
});

describe("limit classes and the promo", () => {
  test("a class patch keeps the class's other fields", () => {
    const next = applyPatch(DEFAULT_SETTINGS, {
      limitClasses: { 2: { maxReminders: 30 } },
    });
    expect(next.limitClasses[2]).toEqual({
      ...DEFAULT_SETTINGS.limitClasses[2],
      maxReminders: 30,
    });
    expect(next.limitClasses[1]).toEqual(DEFAULT_SETTINGS.limitClasses[1]);
  });

  test("reverting a class patch restores just the named field", () => {
    const patch = { limitClasses: { 2: { maxReminders: 30 } } };
    const draft = applyPatch(DEFAULT_SETTINGS, {
      limitClasses: { 2: { maxReminders: 30, limitMultiplier: 9 } },
    });
    const next = revertPatch(draft, DEFAULT_SETTINGS, patch);
    expect(next.limitClasses[2].maxReminders).toBe(
      DEFAULT_SETTINGS.limitClasses[2].maxReminders,
    );
    expect(next.limitClasses[2].limitMultiplier).toBe(9);
  });

  test("reverting a promo over a saved null gives null back", () => {
    const boost = { percent: 50, untilMs: 1_000 };
    const patch = { limitBoost: boost };
    const draft = applyPatch(DEFAULT_SETTINGS, patch);
    expect(draft.limitBoost).toEqual(boost);
    expect(revertPatch(draft, DEFAULT_SETTINGS, patch).limitBoost).toBeNull();
  });
});

describe("useSettingsAutosave", () => {
  test("starts with the saved settings as the draft and no status", () => {
    function Probe() {
      const { draft, status } = useSettingsAutosave({
        settings: DEFAULT_SETTINGS,
        onSaved: () => {},
      });
      return (
        <p>
          {String(draft === DEFAULT_SETTINGS)} {status}
        </p>
      );
    }
    expect(renderToStaticMarkup(<Probe />)).toBe("<p>true idle</p>");
  });
});
