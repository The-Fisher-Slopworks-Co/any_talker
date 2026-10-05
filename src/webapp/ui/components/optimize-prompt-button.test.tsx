// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../i18n-context";
import { OptimizePromptButton } from "./optimize-prompt-button";

describe("OptimizePromptButton", () => {
  // Screens with a Save button tell the admin to save the pasted prompt.
  test("its own card and a footer that mentions saving", () => {
    const html = renderToStaticMarkup(
      <I18nProvider lang="en">
        <OptimizePromptButton prompt="p" />
      </I18nProvider>,
    );
    expect(html).toContain("Copy for Optimization");
    expect(html).toContain("back and save.");
  });
});
