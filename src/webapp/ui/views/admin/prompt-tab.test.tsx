// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../../i18n-context";
import { DEFAULT_SETTINGS } from "../../../../shared/types";
import { PromptTab } from "./prompt-tab";

const html = renderToStaticMarkup(
  <I18nProvider lang="en">
    <PromptTab settings={DEFAULT_SETTINGS} onSaved={() => {}} />
  </I18nProvider>,
);

describe("PromptTab markup", () => {
  test("autosaves: no save button", () => {
    expect(html).not.toMatch(/>(Save|Saved)</);
  });

  test("routing is one group of picker rows", () => {
    for (const label of [
      "Sort Providers By",
      "Provider",
      "Service Tier",
      "Thinking Level",
    ])
      expect(html).toContain(`>${label}</span><span class="relative`);
    expect(html).not.toContain("radiogroup");
    expect(html).not.toContain("/ask");
  });

  test("the zone must be set, and the collapse limit has its unit", () => {
    expect(html).not.toContain("Automatic");
    expect(html).toContain("Collapse Replies Over");
    expect(html).toContain("chars");
  });
});
