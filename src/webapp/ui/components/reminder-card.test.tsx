// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// A server-render smoke test, like quarantined-reminder-card.test.tsx: the
// admin rows and their swipe action have to reach the markup, and the user's
// own list has to stay as it was.

import { test, expect, describe } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../i18n-context";
import { DateFmtProvider } from "../datetime-context";
import type { Reminder } from "../../../reminders/types";
import { ReminderCard, type ReminderCardManage } from "./reminder-card";

const reminder: Reminder = {
  id: "r1",
  userId: "42",
  chatId: "42",
  lang: "en",
  fireAtMs: Date.UTC(2026, 0, 2, 9, 30),
  text: "buy milk",
  target: { kind: "guest_dm", userId: "42" },
  createdAtMs: 0,
  contextMessages: [],
};

function render(actions?: ReminderCardManage): string {
  return renderToStaticMarkup(
    <I18nProvider lang="en">
      <DateFmtProvider dateFormat="iso" timezone="Europe/Moscow">
        <ReminderCard
          reminders={[reminder]}
          chats={{}}
          emptyText="none"
          manage={actions}
        />
      </DateFmtProvider>
    </I18nProvider>,
  );
}

function manage(over: Partial<ReminderCardManage> = {}): ReminderCardManage {
  return { onOpen: () => {}, onDelete: async () => {}, ...over };
}

describe("ReminderCard", () => {
  test("the user's own list stays a read-only card with the full date", () => {
    const html = render();
    expect(html).toContain("buy milk");
    expect(html).toContain("2026-01-02 12:30:00");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("swipe-row");
  });

  test("the admin list is one navigation row per reminder", () => {
    const html = render(manage());
    expect(html).toContain("buy milk");
    // When, who and where under the text.
    expect(html).toContain("2026-01-02 12:30 · id 42 · DM");
    expect(html).not.toContain(">Edit<");
    expect(html).not.toContain(">Remove<");
  });

  test("every admin row swipes to a red Delete", () => {
    const html = render(manage());
    expect(html).toContain("swipe-row");
    expect(html).toContain(">Delete</button>");
  });
});
