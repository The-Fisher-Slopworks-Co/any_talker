// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// A server-render smoke test, like quarantined-reminder-card.test.tsx: the
// admin row actions and the inline editor have to reach the markup.

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
          showUserId={true}
          emptyText="none"
          manage={actions}
        />
      </DateFmtProvider>
    </I18nProvider>,
  );
}

function manage(over: Partial<ReminderCardManage> = {}): ReminderCardManage {
  return {
    editingId: null,
    busy: false,
    onEdit: () => {},
    onSaved: () => {},
    onDelete: () => {},
    ...over,
  };
}

describe("ReminderCard", () => {
  test("the user's own list stays read-only", () => {
    const html = render();
    expect(html).toContain("buy milk");
    expect(html).not.toContain(">Edit<");
    expect(html).not.toContain(">Remove<");
  });

  test("the admin list offers edit and remove on every row", () => {
    const html = render(manage());
    expect(html).toContain(">Edit<");
    expect(html).toContain(">Remove<");
  });

  test("the row being edited turns into the editor, in the viewer's timezone", () => {
    const html = render(manage({ editingId: "r1" }));
    expect(html).toContain('type="datetime-local"');
    // 09:30 UTC is 12:30 in Moscow.
    expect(html).toContain('value="2026-01-02T12:30"');
    expect(html).toContain(">buy milk</textarea>");
    expect(html).not.toContain(">Edit<");
  });
});
