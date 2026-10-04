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
    authorName: null,
    authorUsername: null,
    chatTitle: null,
    threadCount: 2,
    turnCount: 7,
    ...over,
  };
}

function render(
  entries: FeedbackSummary[],
  lang: "en" | "ru" = "en",
  onLoadMore?: () => void,
): string {
  return renderToStaticMarkup(
    <I18nProvider lang={lang}>
      <DateFmtProvider dateFormat="iso" timezone="UTC">
        <FeedbackCard
          entries={entries}
          onOpen={() => {}}
          onDelete={async () => {}}
          onLoadMore={onLoadMore}
          loadingMore={false}
          emptyText="No reports."
        />
      </DateFmtProvider>
    </I18nProvider>,
  );
}

describe("FeedbackCard", () => {
  test("a row is the text, then author, date and thread count", () => {
    const html = render([entry({ authorName: "Sam Rivera" })]);
    expect(html).toContain("the bot answered in the wrong language");
    expect(html).toContain("Sam Rivera · ");
    expect(html).toContain("2026");
    expect(html).toContain("· 2 threads");
    expect(html).not.toContain("turns");
  });

  test("falls back from the name to the @username to the id", () => {
    expect(render([entry({ authorUsername: "sam" })])).toContain("@sam · ");
    expect(render([entry()])).toContain("id u42 · ");
    expect(render([entry({ isGuest: true })])).toContain("id u42 · guest");
  });

  test("marks only new reports, with a label a screen reader can say", () => {
    expect(render([entry()])).toContain('aria-label="New"');
    expect(render([entry({ status: "closed" })])).not.toContain("aria-label");
  });

  test("swipes to a Delete action and has no inline links", () => {
    const html = render([entry()]);
    expect(html).toContain("Delete");
    expect(html).not.toContain(">Open<");
    expect(html).not.toContain(">Remove<");
  });

  // The list route sends the text whole, up to Telegram's 4096 characters, and
  // an empty snapshot (the copied threads expired) is a normal state.
  test("cuts a long text and survives an empty snapshot and an empty list", () => {
    const long = render([entry({ text: "x".repeat(5000) })]);
    expect(long).not.toContain("x".repeat(500));
    expect(render([entry({ threadCount: 0 })])).toContain("0 threads");
    expect(render([])).toContain("No reports.");
  });

  test("offers Load More only when there is another page", () => {
    expect(render([entry()])).not.toContain("Load More");
    expect(render([entry()], "en", () => {})).toContain("Load More");
  });

  // Russian spends three forms on the thread count: the row must not settle
  // for the one that happens to fit the fixture.
  test("takes its words from the catalogue and declines the count", () => {
    const html = render([entry({ threadCount: 2 })], "ru", () => {});
    expect(html).toContain("2 диалога");
    expect(html).toContain("Удалить");
    expect(html).toContain("Показать ещё");
    expect(render([entry({ threadCount: 11 })], "ru")).toContain("11 диалогов");
    expect(render([entry({ threadCount: 1 })], "ru")).toContain("1 диалог");
  });
});
