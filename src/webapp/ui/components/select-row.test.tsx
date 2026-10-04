// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { t } from "../../../shared/i18n";
import { chatSubtitle } from "../lib/labels";
import { Avatar } from "./avatar";
import { NavRow } from "./select-row";

describe("NavRow with an avatar", () => {
  const html = renderToStaticMarkup(
    <NavRow
      avatar={<Avatar id="1" name="Alex Morgan" />}
      title="Alex Morgan"
      subtitle="@alex_morgan"
      value="$1.84"
      onClick={() => {}}
    />,
  );

  test("marks the row so its separator starts after the avatar", () => {
    expect(html).toContain("row-avatar");
    expect(html).not.toContain("row-icon");
  });

  test("shows the value between the text and the chevron", () => {
    expect(html.indexOf("@alex_morgan")).toBeLessThan(html.indexOf("$1.84"));
    expect(html.indexOf("$1.84")).toBeLessThan(html.indexOf("<svg", 10));
  });
});

describe("NavRow title", () => {
  const render = (wrapTitle = false) =>
    renderToStaticMarkup(
      <NavRow title="A long note" wrapTitle={wrapTitle} onClick={() => {}} />,
    );

  test("is cut at one line by default", () => {
    expect(render()).toContain('class="truncate"');
  });

  test("runs to two lines when asked to wrap", () => {
    expect(render(true)).toContain("line-clamp-2");
    expect(render(true)).not.toContain("truncate");
  });
});

describe("chatSubtitle", () => {
  test("names the capitalised type, with the handle when titled", () => {
    const en = t("en");
    const base = {
      id: "-1",
      title: null,
      username: null,
      firstSeenAt: 0,
      lastSeenAt: 0,
    };
    expect(chatSubtitle(en, { ...base, type: "supergroup" })).toBe(
      "Supergroup",
    );
    expect(
      chatSubtitle(en, {
        ...base,
        type: "supergroup",
        title: "Club",
        username: "club",
      }),
    ).toBe("Supergroup · @club");
  });
});

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

  test("shows a labelled dot before the chevron", () => {
    const html = render({ dotLabel: "New" });
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="New"');
    expect(html.indexOf("rounded-full")).toBeLessThan(html.indexOf("<svg"));
    expect(render({})).not.toContain("rounded-full");
  });

  test("hides a zero badge and an absent value", () => {
    expect(render({ badge: 0 })).not.toContain("bg-tg-destructive");
    expect(render({})).not.toContain("<span");
  });
});
