// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// Server-render smoke test, like `usage-header.test.tsx`: the editable fact
// list shared by the user's vault and the admin's user screen.

import { test, expect, describe } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../i18n-context";
import type { FactsResponse } from "../api-client";
import { FactsEditor, type FactsWriter } from "./facts-view";

const unused = () => Promise.reject(new Error("not called"));
const writer: FactsWriter = { add: unused, update: unused, remove: unused };

function render(data: FactsResponse): string {
  return renderToStaticMarkup(
    <I18nProvider lang="en">
      <FactsEditor
        writer={writer}
        scope="main"
        data={data}
        onChange={() => {}}
      />
    </I18nProvider>,
  );
}

describe("FactsEditor markup", () => {
  test("lists every fact as a clickable row and offers to add one", () => {
    const html = render({
      facts: [
        { key: "pets", value: "two cats" },
        { key: "job", value: "welder" },
      ],
      cap: 50,
    });
    expect(html).toContain("pets");
    expect(html).toContain("two cats");
    expect(html).toContain("welder");
    expect(html).toMatch(/<button[^>]*>Add fact<\/button>/);
  });

  test("disables adding at the cap", () => {
    const html = render({
      facts: [{ key: "pets", value: "two cats" }],
      cap: 1,
    });
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Add fact<\/button>/);
  });
});
