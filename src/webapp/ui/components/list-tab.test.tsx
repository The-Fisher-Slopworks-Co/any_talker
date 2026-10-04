// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../i18n-context";
import { ListTab } from "./list-tab";

type Item = { id: string; name: string; paused?: boolean; avatar?: boolean };

function render(items: Item[] | null): string {
  return renderToStaticMarkup(
    <I18nProvider lang="en">
      <ListTab
        items={items}
        footer="Daily question."
        createLabel="New Check"
        onEdit={() => {}}
        onCreate={() => {}}
        renderRow={(i) => ({
          id: i.id,
          title: i.name,
          subtitle: "08:30",
          ...(i.paused ? { value: "Paused" } : {}),
          ...(i.avatar ? { avatar: <span>{`avatar-${i.id}`}</span> } : {}),
        })}
      />
    </I18nProvider>,
  );
}

describe("ListTab", () => {
  test("ends the one card of rows with the add row, not a card of its own", () => {
    const html = render([{ id: "a", name: "Morning stretch" }]);
    expect(html.match(/class="card /g)).toHaveLength(1);
    expect(html.indexOf("Morning stretch")).toBeLessThan(
      html.indexOf("New Check"),
    );
    expect(html).toContain("Daily question.");
    expect(html).not.toContain("section-header");
    expect(html).not.toContain("add-row-avatar");
  });

  test("shows a row's state before its chevron", () => {
    const html = render([
      { id: "a", name: "Morning stretch" },
      { id: "b", name: "Evening reading", paused: true },
    ]);
    expect(html.match(/>Paused</g)).toHaveLength(1);
    expect(html.indexOf("Evening reading")).toBeLessThan(
      html.indexOf("Paused"),
    );
  });

  test("leads each row with its avatar", () => {
    const html = render([{ id: "a", name: "Morning stretch", avatar: true }]);
    expect(html).toContain("row-avatar");
    expect(html).toContain("add-row-avatar");
    expect(html.indexOf("avatar-a")).toBeLessThan(
      html.indexOf("Morning stretch"),
    );
  });

  test("leaves the add row alone in the card when there are no items", () => {
    const html = render([]);
    expect(html).toContain("New Check");
    expect(html).not.toContain("Morning stretch");
  });

  test("shows only the loading state while items load", () => {
    const html = render(null);
    expect(html).not.toContain("New Check");
  });
});
