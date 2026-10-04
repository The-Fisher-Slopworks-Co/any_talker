// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// Server-render smoke test, like `usage-header.test.tsx`: the editable fact
// list shared by the user's vault and the admin's user screen.

import { test, expect, describe } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../i18n-context";
import type { FactsResponse } from "../api-client";
import { FactsEditor, sheetMotion, type FactsWriter } from "./facts-view";

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

describe("fact sheet motion", () => {
  const classes = (s: string) => s.split(/\s+/).filter(Boolean);

  test("slides in from the bottom over a fading-in dim", () => {
    const { backdrop, panel } = sheetMotion(false);
    expect(classes(backdrop)).toContain("starting:opacity-0");
    expect(classes(panel)).toContain("motion-safe:starting:translate-y-full");
    expect(classes(backdrop)).not.toContain("opacity-0");
    expect(panel).not.toMatch(/(^|\s)motion-safe:translate-y-full/);
  });

  test("slides back out when closing", () => {
    const { backdrop, panel } = sheetMotion(true);
    expect(classes(backdrop)).toContain("opacity-0");
    expect(classes(panel)).toContain("motion-safe:translate-y-full");
  });

  test("only fades with reduced motion", () => {
    for (const closing of [false, true]) {
      const { panel } = sheetMotion(closing);
      for (const cls of classes(panel).filter((c) => c.includes("translate-y")))
        expect(cls.startsWith("motion-safe:")).toBe(true);
      expect(panel).toContain(
        closing
          ? "motion-reduce:opacity-0"
          : "motion-reduce:starting:opacity-0",
      );
    }
  });
});
