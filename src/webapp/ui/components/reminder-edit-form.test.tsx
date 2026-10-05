// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// A server-render smoke test, like quarantined-reminder-card.test.tsx: the
// sheet's form, its read-only rows and its delete have to reach the markup.

import { test, expect, describe } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../i18n-context";
import { DateFmtProvider } from "../datetime-context";
import type { Reminder } from "../../../reminders/types";
import { ReminderEditForm } from "./reminder-edit-form";

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

function render(onUserClick?: (id: string) => void, lang: "en" | "ru" = "en") {
  return renderToStaticMarkup(
    <I18nProvider lang={lang}>
      <DateFmtProvider dateFormat="iso" timezone="Europe/Moscow">
        <ReminderEditForm
          reminder={reminder}
          where="Weekend Hikers"
          author="Alex · @alex_morgan"
          onUserClick={onUserClick}
          onSaved={() => {}}
          onDeleted={() => {}}
          onClose={() => {}}
        />
      </DateFmtProvider>
    </I18nProvider>,
  );
}

describe("ReminderEditForm", () => {
  test("is a sheet with Cancel and Save in its header", () => {
    const html = render();
    expect(html).toContain('role="dialog"');
    expect(html).toContain(">Reminder<");
    expect(html).toContain(">Cancel<");
    expect(html).toContain(">Save<");
  });

  test("edits the time, in the viewer's timezone, and the note in one card", () => {
    const html = render();
    expect(html).toContain("Date &amp; Time");
    // 09:30 UTC is 12:30 in Moscow.
    expect(html).toContain('type="datetime-local"');
    expect(html).toContain('value="2026-01-02T12:30"');
    // The visible text is the app's format; the native input lies over it
    // invisibly instead of showing the browser's own, wide one.
    expect(html).toContain("2026-01-02 12:30<input");
    expect(html).toContain("opacity-0");
    expect(html).toContain(">buy milk</textarea>");
    // The hairline between the two rows needs a `.row` around the textarea.
    expect(html).toContain('<div class="row relative"><textarea');
    // The timezone note stands under the card until there is an error.
    expect(html).toContain("Times use Europe/Moscow.");
  });

  test("names the chat and links to the author", () => {
    const html = render(() => {});
    expect(html).toContain(">Chat<");
    expect(html).toContain("Weekend Hikers");
    expect(html).toContain(">Open User<");
    expect(html).toContain("Alex · @alex_morgan");
  });

  test("has no way to the author where there is no user page to open", () => {
    expect(render()).not.toContain("Open User");
  });

  test("keeps the delete apart, in red, at the bottom", () => {
    const html = render();
    expect(html).toContain(">Delete Reminder</button>");
    expect(html).toContain("text-tg-destructive");
    expect(html).toContain("justify-center");
    expect(html.indexOf("Delete Reminder")).toBeGreaterThan(
      html.indexOf("Weekend Hikers"),
    );
  });

  test("is translated", () => {
    const html = render(() => {}, "ru");
    expect(html).toContain("Дата и время");
    expect(html).toContain("Открыть пользователя");
    expect(html).toContain("Удалить напоминание");
  });
});
