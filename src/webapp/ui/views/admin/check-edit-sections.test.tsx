// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../../i18n-context";
import { DEFAULT_DRAFT } from "./check-edit-form";
import { QuestionSection, RecipientSection } from "./check-edit-sections";

function render(node: React.ReactNode): string {
  return renderToStaticMarkup(<I18nProvider lang="en">{node}</I18nProvider>);
}

const props = { draft: DEFAULT_DRAFT, set: () => {}, commit: () => {} };

describe("check editor groups", () => {
  test("the title and the question share the Question card", () => {
    const html = render(<QuestionSection {...props} />);
    expect(html.match(/class="card /g)?.length).toBe(1);
    expect(html).toContain(">Question<");
    expect(html).toContain(">Title<");
    expect(html).toContain("<textarea");
    expect(html).toContain("{name} mentions the user");
  });

  test("the recipient group names the user and the chat", () => {
    const html = render(<RecipientSection {...props} />);
    for (const label of ["Recipient", "Chat ID", "User ID", "Name Shown"]) {
      expect(html).toContain(`>${label}<`);
    }
    expect(html).toContain("Replaces {name}");
  });
});
