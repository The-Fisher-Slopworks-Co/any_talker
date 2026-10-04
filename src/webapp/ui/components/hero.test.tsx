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
        note="Running"
        action={{ label: "Open in Telegram", onClick: () => {} }}
      />,
    );
    expect(html).toContain("SR");
    expect(html).toMatch(/<h1[^>]*>Sam Rivera<\/h1>/);
    expect(html).toContain("@samrivera");
    expect(html.indexOf("Running")).toBeGreaterThan(html.indexOf("@samrivera"));
    expect(html).toContain("Open in Telegram");
  });

  test("keeps the action last unless it is meant to sit under the avatar", () => {
    const render = (under: boolean) =>
      renderToStaticMarkup(
        <Hero
          id="1"
          name="Sam Rivera"
          action={{ label: "Edit", onClick: () => {} }}
          actionUnderAvatar={under}
        />,
      );
    expect(render(false)).toContain("order-last");
    expect(render(true)).not.toContain("order-last");
  });

  test("leaves out what it is not given", () => {
    const html = renderToStaticMarkup(<Hero id="1" name="Sam" />);
    expect(html).not.toContain("<button");
    expect(html).not.toContain("text-tg-hint");
  });
});
