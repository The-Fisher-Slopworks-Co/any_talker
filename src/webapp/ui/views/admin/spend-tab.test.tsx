// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// Server-render test of the admin Spending screen on a fake summary.

import { test, expect, describe } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../../i18n-context";
import type { SpendOverview } from "../../api-client";
import { SpendOverviewView } from "./spend-tab";

const spend = (day: number, month: number) => ({ day, week: month, month });

const EMPTY: SpendOverview = {
  global: spend(1, 2),
  topUsers: [],
  topChats: [],
  models: [],
  topDenied: [],
  unpricedModels: [],
  newUsers: [],
  newChats: [],
};

function render(data: SpendOverview): string {
  return renderToStaticMarkup(
    <I18nProvider lang="en">
      <SpendOverviewView
        data={data}
        onEditUser={() => {}}
        onEditChat={() => {}}
      />
    </I18nProvider>,
  );
}

describe("SpendOverviewView markup", () => {
  test("heads the totals with Everyone and keeps the footer", () => {
    const html = render(EMPTY);
    expect(html).toContain("Everyone");
    expect(html).not.toContain("Total spend");
    expect(html).toContain("Last 30 Days");
    expect(html).toContain("OpenRouter-reported USD");
  });

  test("an empty list is one grey None row, not a hole", () => {
    const html = render(EMPTY);
    expect(html.split(">None<").length - 1).toBe(6);
    expect(html).not.toContain("<button");
  });

  test("top users are rows that open the user, with today as the subtitle", () => {
    const html = render({
      ...EMPTY,
      topUsers: [{ id: "7", label: "@alex", spend: spend(0.5, 1.84) }],
    });
    expect(html).toContain("Top Users · Last 30 Days");
    expect(html).toContain("<button");
    expect(html).toContain("@alex");
    expect(html).toContain("Today $0.50");
    expect(html).toContain("$1.84");
    expect(html).not.toContain("/d)");
  });

  test("models split provider from name; unpriced ones say so; no button", () => {
    const html = render({
      ...EMPTY,
      models: [
        {
          modelId: "anthropic/claude-sonnet-5",
          spend: spend(0, 3),
          unpriced: false,
        },
        { modelId: "acme/free-model", spend: spend(0, 0), unpriced: true },
      ],
    });
    expect(html).toContain(">claude-sonnet-5<");
    expect(html).toContain(">anthropic<");
    expect(html).toContain(">free-model<");
    expect(html).toContain("acme · No cost reported");
    expect(html).not.toContain("<button");
  });

  test("denied, new users and new chats are all clickable", () => {
    const html = render({
      ...EMPTY,
      topDenied: [{ userId: "1", label: "@denied", count: 4 }],
      newUsers: [{ id: "2", label: "@fresh", firstSeenAt: 0 }],
      newChats: [{ id: "-3", label: "Club", firstSeenAt: 0, type: "group" }],
    });
    expect(html.split("<button").length - 1).toBe(3);
    expect(html).toContain(">4<");
    expect(html).toContain(">Group<");
    expect(html).toContain("New Chats · 7 Days");
  });
});
