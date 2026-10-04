// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../../i18n-context";
import { DateFmtProvider } from "../../datetime-context";
import type { FeedbackEntry, FeedbackNames } from "../../api-client";
import { FeedbackReport } from "./feedback-view";

const NOW = Date.UTC(2026, 0, 2, 12, 0, 0);

function entry(over: Partial<FeedbackEntry> = {}): FeedbackEntry {
  return {
    id: "f1",
    userId: "u42",
    chatId: "-100500",
    chatType: "supergroup",
    botId: null,
    isGuest: false,
    lang: "en",
    text: "the bot answered in the wrong language",
    createdAt: NOW,
    threads: [],
    systemPrompt: "You are a bot.",
    systemPromptHash: "0123456789abcdef",
    build: null,
    status: "new",
    ...over,
  };
}

const NAMES: FeedbackNames = {
  authorName: "Sam Rivera",
  authorUsername: "sam",
  chatTitle: "Weekend Hikers",
};

function render(
  e: FeedbackEntry,
  names: FeedbackNames = NAMES,
  lang: "en" | "ru" = "en",
): string {
  return renderToStaticMarkup(
    <I18nProvider lang={lang}>
      <DateFmtProvider dateFormat="iso" timezone="UTC">
        <FeedbackReport
          entry={e}
          names={names}
          status={e.status}
          deleting={false}
          onStatus={() => {}}
          onOpenUser={() => {}}
          onOpenChat={() => {}}
          onDelete={() => {}}
        />
      </DateFmtProvider>
    </I18nProvider>,
  );
}

describe("FeedbackReport", () => {
  test("puts the text first and the status in a picker, not a segmented control", () => {
    const html = render(entry());
    expect(html.indexOf("the bot answered")).toBeLessThan(
      html.indexOf("Status"),
    );
    expect(html).toContain("<select");
    expect(html).toContain('value="closed"');
    expect(html).not.toContain('role="radiogroup"');
  });

  test("names the user and the chat, each a row into its own page", () => {
    const html = render(entry());
    expect(html).toContain("Sam Rivera");
    expect(html).toContain("Weekend Hikers");
    expect(html).not.toContain("u42");
    expect(html.match(/<button/g)).toHaveLength(3); // user, chat, delete
  });

  test("falls back to ids, and a guest has no user page", () => {
    const none = { authorName: null, authorUsername: null, chatTitle: null };
    const html = render(entry({ isGuest: true }), none);
    expect(html).toContain("id u42 · guest");
    expect(html).toContain("-100500 · supergroup");
    expect(html.match(/<button/g)).toHaveLength(2); // chat, delete
  });

  test("ends with a red Delete Report in a card of its own", () => {
    const html = render(entry());
    expect(html).toMatch(/text-tg-destructive[^>]*>Delete Report</);
    expect(html.lastIndexOf("Delete Report")).toBeGreaterThan(
      html.lastIndexOf("System prompt"),
    );
  });

  test("takes its words from the catalogue", () => {
    const html = render(entry(), NAMES, "ru");
    expect(html).toContain("Подробности");
    expect(html).toContain("Удалить отчёт");
    expect(html).toContain("Статус");
  });
});
