// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// A server-render smoke test. The repo has no interactive component harness, but
// rendering to a string is enough to catch the failure mode a typecheck can't
// see: markup that is silently dropped or wired to an element that isn't there.

import { test, expect, describe } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../i18n-context";
import { ModelsCard, committableModels } from "./models-card";

function render(ui: React.ReactElement): string {
  return renderToStaticMarkup(<I18nProvider lang="en">{ui}</I18nProvider>);
}

describe("ModelsCard markup", () => {
  // The regression this exists for: the <datalist> was dropped in a rewrite
  // while the input kept pointing at it, so the id resolved to nothing and the
  // suggestions silently stopped appearing. Neither the typechecker nor a
  // bundle can see that — both halves are individually valid.
  test("the input's list target actually exists in the markup", () => {
    const html = render(
      <ModelsCard models={["anthropic/claude-sonnet-5"]} onChange={() => {}} />,
    );
    const listAttr = /<input[^>]*\blist="([^"]+)"/.exec(html)?.[1];
    expect(listAttr).toBeDefined();
    expect(html).toContain(`<datalist id="${listAttr}"`);
  });

  test("the same list serves every fallback row", () => {
    const html = render(
      <ModelsCard models={["a", "b"]} onChange={() => {}} fallback />,
    );
    const targets = [...html.matchAll(/<input[^>]*\blist="([^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(targets).toHaveLength(2);
    expect(new Set(targets).size).toBe(1);
    expect((html.match(/<datalist/g) ?? []).length).toBe(1);
  });

  test("renders one row without fallback controls by default", () => {
    const html = render(
      <ModelsCard models={["a", "b", "c"]} onChange={() => {}} />,
    );
    expect((html.match(/<input/g) ?? []).length).toBe(1);
    expect(html).not.toContain("Add Fallback");
  });

  test("renders every row plus the add control when fallback is on", () => {
    const html = render(
      <ModelsCard models={["a", "b"]} onChange={() => {}} fallback />,
    );
    expect((html.match(/<input/g) ?? []).length).toBe(2);
    expect(html).toContain("Add Fallback");
    expect(html).toContain(">1</span>");
    expect(html).toContain(">2</span>");
  });

  // styles.css draws row separators with `.row + .row` / `.row + .action-row`,
  // adjacent-sibling rules that a stray element between them silently defeats —
  // and a <datalist> is a real element node despite rendering nothing.
  test("nothing sits between the last row and the action row", () => {
    const html = render(
      <ModelsCard models={["a", "b"]} onChange={() => {}} fallback />,
    );
    expect(html).toContain("action-row");
    expect(html).not.toMatch(/<datalist[\s\S]*action-row/);
  });

  test("the primary row is fixed, every fallback can be swiped away", () => {
    const html = render(
      <ModelsCard models={["a", "b", "c"]} onChange={() => {}} fallback />,
    );
    expect((html.match(/swipe-row/g) ?? []).length).toBe(2);
    expect(html.indexOf("swipe-row")).toBeGreaterThan(
      html.indexOf('value="a"'),
    );
    expect(html).toContain(">Delete</button>");
    expect(html).not.toContain("Remove");
  });

  test("the details line up under the input, not under the marker", () => {
    const withChain = render(
      <ModelsCard models={["a"]} onChange={() => {}} fallback />,
    );
    expect(withChain).toContain("grid-cols-[14px_1fr]");
    const single = render(<ModelsCard models={["a"]} onChange={() => {}} />);
    expect(single).not.toContain("grid-cols-[14px_1fr]");
    expect(single).not.toContain("swipe-row");
  });

  test("shows the invalid-model warning only once a catalogue can judge", () => {
    // No catalogue has loaded in a static render, so an unknown id must not be
    // accused of anything yet.
    const html = render(
      <ModelsCard models={["not-a-real-id"]} onChange={() => {}} />,
    );
    expect(html).not.toContain("isn’t in /v1/models");
  });
});

describe("committableModels", () => {
  const known = (id: string) => id !== "bad";

  test("trims the ids and drops blank rows", () => {
    expect(committableModels([" a ", "", "b"], known)).toEqual(["a", "b"]);
  });

  test("offers nothing while a row is unknown or all rows are blank", () => {
    expect(committableModels(["a", "bad"], known)).toBeNull();
    expect(committableModels(["", "  "], known)).toBeNull();
  });
});
