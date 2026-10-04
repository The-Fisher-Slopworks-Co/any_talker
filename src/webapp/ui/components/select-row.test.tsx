// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { NavRow } from "./select-row";

const render = (props: Partial<Parameters<typeof NavRow>[0]>) =>
  renderToStaticMarkup(<NavRow title="Users" onClick={() => {}} {...props} />);

describe("NavRow", () => {
  test("shows a value in the hint colour before the chevron", () => {
    const html = render({ value: "On" });
    expect(html).toMatch(/<span class="[^"]*text-tg-hint[^"]*">On<\/span>/);
    expect(html.indexOf(">On<")).toBeLessThan(html.indexOf("<svg"));
  });

  test("shows a badge as a red pill", () => {
    const html = render({ badge: 3 });
    expect(html).toMatch(/<span class="[^"]*bg-tg-destructive[^"]*">3<\/span>/);
  });

  test("hides a zero badge and an absent value", () => {
    expect(render({ badge: 0 })).not.toContain("bg-tg-destructive");
    expect(render({})).not.toContain("<span");
  });
});
