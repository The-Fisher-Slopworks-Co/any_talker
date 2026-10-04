// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../i18n-context";
import { OptimizePromptFooter } from "./optimize-prompt-button";

describe("OptimizePromptFooter", () => {
  // Every prompt screen autosaves, so the instruction never mentions saving.
  test("tells the admin to paste the shortened prompt back, without saving", () => {
    const html = renderToStaticMarkup(
      <I18nProvider lang="en">
        <OptimizePromptFooter
          optimize={{ ready: true, status: "idle", copy: () => {} }}
          autosaves
        />
      </I18nProvider>,
    );
    expect(html).toContain("paste the shortened prompt back here.");
    expect(html).not.toContain("save");
  });

  test("reports a clipboard failure instead", () => {
    const html = renderToStaticMarkup(
      <I18nProvider lang="en">
        <OptimizePromptFooter
          optimize={{ ready: true, status: "failed", copy: () => {} }}
        />
      </I18nProvider>,
    );
    expect(html).toContain("Could not copy to the clipboard.");
  });
});
