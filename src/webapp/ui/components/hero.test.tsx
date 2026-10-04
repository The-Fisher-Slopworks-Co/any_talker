// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Hero } from "./hero";

describe("Hero", () => {
  test("shows the avatar initials, the name, the subtitle and the action", () => {
    const html = renderToStaticMarkup(
      <Hero
        id="1000002"
        name="Sam Rivera"
        subtitle="@samrivera"
        action={{ label: "Open in Telegram", onClick: () => {} }}
      />,
    );
    expect(html).toContain("SR");
    expect(html).toMatch(/<h1[^>]*>Sam Rivera<\/h1>/);
    expect(html).toContain("@samrivera");
    expect(html).toContain("Open in Telegram");
  });

  test("leaves out what it is not given", () => {
    const html = renderToStaticMarkup(<Hero id="1" name="Sam" />);
    expect(html).not.toContain("<button");
    expect(html).not.toContain("text-tg-hint");
  });
});
