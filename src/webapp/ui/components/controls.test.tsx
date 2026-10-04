// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ActionRow } from "./controls";
import { AddRow } from "./add-row";

const DISABLED = /<button[^>]* disabled=""/;

describe("ActionRow", () => {
  test("is a left-aligned link-coloured row", () => {
    const html = renderToStaticMarkup(
      <ActionRow onClick={() => {}}>Copy</ActionRow>,
    );
    expect(html).toContain("action-row");
    expect(html).toContain("text-left");
    expect(html).toContain("text-tg-link");
    expect(html).not.toContain("text-tg-destructive");
    expect(html).not.toContain("font-semibold");
    expect(html).not.toMatch(DISABLED);
  });

  test("bold marks the primary action of a form", () => {
    const html = renderToStaticMarkup(
      <ActionRow bold onClick={() => {}}>
        Create Token
      </ActionRow>,
    );
    expect(html).toContain("font-semibold");
  });

  test("destructive swaps the link colour for the destructive one", () => {
    const html = renderToStaticMarkup(
      <ActionRow destructive onClick={() => {}}>
        Revoke Token
      </ActionRow>,
    );
    expect(html).toContain("text-tg-destructive");
    expect(html).not.toContain("text-tg-link");
  });

  test("disabled reaches the button", () => {
    const html = renderToStaticMarkup(
      <ActionRow disabled onClick={() => {}}>
        Copy
      </ActionRow>,
    );
    expect(html).toMatch(DISABLED);
  });
});

describe("AddRow", () => {
  test("pairs the label with the plus circle", () => {
    const html = renderToStaticMarkup(
      <AddRow label="New Check" onClick={() => {}} />,
    );
    expect(html).toContain("action-row");
    expect(html).toContain("New Check");
    expect(html).toContain("<svg");
    expect(html).not.toMatch(DISABLED);
  });

  test("can be disabled", () => {
    const html = renderToStaticMarkup(
      <AddRow label="New Check" disabled onClick={() => {}} />,
    );
    expect(html).toMatch(DISABLED);
  });
});
