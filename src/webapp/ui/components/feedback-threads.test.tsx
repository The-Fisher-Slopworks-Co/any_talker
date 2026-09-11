// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// A server-render smoke test, like feedback-card.test.tsx. What it is here to
// pin down are the two states the snapshot is allowed to arrive in — no threads
// at all, and a `pointedAt` matching none of them — plus the generation links,
// which are the whole reason the record stores run metadata.

import { test, expect, describe } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../i18n-context";
import { DateFmtProvider } from "../datetime-context";
import type { ThreadSnapshot } from "../api-client";
import { FeedbackThreads } from "./feedback-threads";

const NOW = Date.UTC(2026, 0, 2, 12, 0, 0);

function thread(over: Partial<ThreadSnapshot> = {}): ThreadSnapshot {
  return {
    kind: "chain",
    chatId: "-100500",
    botId: null,
    ts: NOW,
    turns: [
      {
        botMsgId: 77,
        userQuestion: "why did you answer in English",
        botAnswer: "sorry",
        ts: NOW,
        run: { gen: ["gen-1789064867-b8Jgaf5awCPg2hexiRjE"], model: "x/y" },
      },
    ],
    ...over,
  };
}

function render(
  threads: ThreadSnapshot[],
  pointedAt: { chatId: string; botMsgId: number } | null = null,
  lang: "en" | "ru" = "en",
): string {
  return renderToStaticMarkup(
    <I18nProvider lang={lang}>
      <DateFmtProvider dateFormat="iso" timezone="UTC">
        <FeedbackThreads threads={threads} pointedAt={pointedAt} />
      </DateFmtProvider>
    </I18nProvider>,
  );
}

describe("FeedbackThreads", () => {
  test("renders the snapshot as JSON and links every generation id", () => {
    const html = render([thread()]);
    expect(html).toContain("why did you answer in English");
    expect(html).toContain("#1 · chat -100500 · turns: 1");
    expect(html).toContain(
      "https://openrouter.ai/activity?id=gen-1789064867-b8Jgaf5awCPg2hexiRjE",
    );
    expect(html).toContain("<pre");
  });

  test("says so when a turn carries no generation ids", () => {
    const html = render([
      thread({ turns: [{ userQuestion: "q", botAnswer: "a" }] }),
    ]);
    expect(html).toContain("no generation ids");
    expect(html).not.toContain("openrouter.ai");
  });

  // Both are normal states: the copied threads expire with the conversation
  // graph, and the snapshot is "recent threads" regardless of what was replied to.
  test("survives an empty snapshot and a pointedAt matching no thread", () => {
    expect(render([])).toContain("No threads in this snapshot");
    const missing = render([thread()], { chatId: "-100500", botMsgId: 999 });
    expect(missing).toContain("is in none of the snapshotted threads");
    const other = render([thread()], { chatId: "-100999", botMsgId: 77 });
    expect(other).toContain("is in none of the snapshotted threads");
  });

  test("marks the thread the report pointed at", () => {
    const html = render([thread()], { chatId: "-100500", botMsgId: 77 });
    expect(html).toContain("chain · pointed at");
    expect(html).not.toContain("is in none of the snapshotted threads");
  });

  test("takes its labels from the catalogue, not from English literals", () => {
    const html = render([thread({ kind: "guest" })], null, "ru");
    expect(html).toContain("#1 · чат -100500 · ходов: 1");
    expect(html).toContain("гостевой");
    expect(html).toContain("Генерации:");
  });
});
