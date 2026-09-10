// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// A server-render smoke test, like quarantined-reminder-card.test.tsx: a report
// that reaches the view and still leaves nothing on screen.

import { test, expect, describe } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../i18n-context";
import { DateFmtProvider } from "../datetime-context";
import type { FeedbackSummary } from "../api-client";
import { FeedbackCard } from "./feedback-card";

const NOW = Date.UTC(2026, 0, 2, 12, 0, 0);

function entry(over: Partial<FeedbackSummary> = {}): FeedbackSummary {
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
    systemPromptHash: "0123456789abcdef",
    build: "abc1234",
    status: "new",
    threadCount: 2,
    turnCount: 7,
    ...over,
  };
}

function render(entries: FeedbackSummary[], lang: "en" | "ru" = "en"): string {
  return renderToStaticMarkup(
    <I18nProvider lang={lang}>
      <DateFmtProvider dateFormat="iso" timezone="UTC">
        <FeedbackCard
          entries={entries}
          busy={false}
          onDelete={() => {}}
          emptyText="No reports."
        />
      </DateFmtProvider>
    </I18nProvider>,
  );
}

describe("FeedbackCard", () => {
  test("shows what identifies a report without opening it", () => {
    const html = render([entry()]);
    expect(html).toContain("the bot answered in the wrong language");
    expect(html).toContain("id u42");
    expect(html).toContain("threads: 2 · turns: 7");
    expect(html).toContain("New");
    expect(html).toContain("2026-01-02");
  });

  // The list route sends the text whole, up to Telegram's 4096 characters, and
  // an empty snapshot (the copied threads expired) is a normal state.
  test("cuts a long text down to a preview and survives an empty snapshot", () => {
    const long = render([entry({ text: "x".repeat(5000) })]);
    expect(long).toContain("…");
    expect(long).not.toContain("x".repeat(500));
    expect(render([entry({ threadCount: 0, turnCount: 0 })])).toContain(
      "threads: 0 · turns: 0",
    );
    expect(render([])).toContain("No reports.");
  });

  test("takes its labels from the catalogue, not from English literals", () => {
    const html = render([entry({ status: "closed" })], "ru");
    expect(html).toContain("диалогов: 2 · ходов: 7");
    expect(html).toContain("Закрыт");
    expect(html).toContain("Удалить");
  });
});
