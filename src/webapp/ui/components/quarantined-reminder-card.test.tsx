// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// A server-render smoke test, like models-card.test.tsx: rendering to a string
// is enough to catch what a typecheck cannot — a record that reaches the view
// and still leaves nothing on screen.

import { test, expect, describe } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../i18n-context";
import { DateFmtProvider } from "../datetime-context";
import type { QuarantinedReminder } from "../../../storage/types/reminders";
import { QUARANTINE_TTL_MS } from "../../../storage/types/reminders";
import { QuarantinedReminderCard } from "./quarantined-reminder-card";

const NOW = Date.UTC(2026, 0, 2, 12, 0, 0);

function render(
  quarantined: QuarantinedReminder[],
  lang: "en" | "ru" = "en",
): string {
  return renderToStaticMarkup(
    <I18nProvider lang={lang}>
      <DateFmtProvider dateFormat="iso" timezone="UTC">
        <QuarantinedReminderCard
          quarantined={quarantined}
          nowMs={NOW}
          emptyText="Nothing was rejected."
        />
      </DateFmtProvider>
    </I18nProvider>,
  );
}

function record(over: Partial<QuarantinedReminder> = {}): QuarantinedReminder {
  return {
    id: "r1",
    raw: JSON.stringify({ id: "r1", userId: "u42", text: "buy milk" }),
    reason: "schema_violation",
    quarantinedAtMs: NOW - 24 * 60 * 60 * 1000,
    ...over,
  };
}

describe("QuarantinedReminderCard", () => {
  // The regression this whole view exists to prevent: a record sits in
  // quarantine and nobody can see it. Every field that lets an admin act on it
  // has to be on screen without opening the payload.
  test("shows what identifies a record without opening the payload", () => {
    const html = render([record()]);
    expect(html).toContain("id r1");
    expect(html).toContain("user u42");
    expect(html).toContain("buy milk");
    expect(html).toContain("Does not match the schema");
    expect(html).toContain("2026-01-01");
  });

  test("counts down the retention window", () => {
    const html = render([record()]);
    // One day into a 30-day window.
    expect(html).toContain("expires in ~29 d");

    const stale = render([
      record({ quarantinedAtMs: NOW - QUARANTINE_TTL_MS - 1 }),
    ]);
    expect(stale).toContain("expired");
    expect(stale).not.toContain("expires in");
  });

  test("names the invalid-JSON reason and drops the fields it cannot read", () => {
    const html = render([
      record({ raw: "{not json at all", reason: "invalid_json" }),
    ]);
    expect(html).toContain("Not valid JSON");
    expect(html).toContain("id r1");
    expect(html).not.toContain("user u42");
  });

  test("keeps the payload behind a toggle rather than on screen", () => {
    const html = render([record()]);
    expect(html).toContain("Show payload");
    expect(html).not.toContain("<pre");
  });

  test("reads as nothing-was-rejected when the quarantine is empty", () => {
    const html = render([]);
    expect(html).toContain("Nothing was rejected.");
    expect(html).not.toContain("Show payload");
  });

  test("takes its labels from the catalogue, not from English literals", () => {
    const html = render([record()], "ru");
    expect(html).toContain("Не соответствует схеме");
    expect(html).toContain("пользователь u42");
    expect(html).toContain("Показать данные");
  });
});
