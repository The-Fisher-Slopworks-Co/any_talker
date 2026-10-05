// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { t } from "../../../shared/i18n";
import { chatAccessLabel } from "./labels";

describe("chatAccessLabel", () => {
  const en = t("en");
  const listed = [{ id: "-100" }];

  test("is empty for a chat on neither list", () => {
    expect(chatAccessLabel(en, "-100", [], [])).toBeUndefined();
  });

  test("reads Allowed or Blocked from the list the chat is on", () => {
    expect(chatAccessLabel(en, "-100", listed, [])).toBe("Allowed");
    expect(chatAccessLabel(en, "-100", [], listed)).toBe("Blocked");
    expect(chatAccessLabel(t("ru"), "-100", [], listed)).toBe("Заблокирован");
  });

  test("lets the blacklist win", () => {
    expect(chatAccessLabel(en, "-100", listed, listed)).toBe("Blocked");
  });
});
