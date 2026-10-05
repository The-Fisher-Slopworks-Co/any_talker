// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// A server-render smoke test, like models-card.test.tsx: rendering to a string
// is enough to catch what a typecheck cannot — a record that reaches the view
// and still leaves nothing on screen.

import { test, expect, describe } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../i18n-context";
import { formatShortDateTime } from "../../../shared/date-format";
import { DateFmtProvider } from "../datetime-context";
import type { QuarantinedReminder } from "../../../storage/types/reminders";
import { QUARANTINE_TTL_MS } from "../../../storage/types/reminders";
import {
  PayloadSheet,
  QuarantinedReminderCard,
} from "./quarantined-reminder-card";

// The short dates count days from the real clock, so the records are placed
// relative to it.
const NOW = Date.now();

function wrap(node: React.ReactNode, lang: "en" | "ru" = "en"): string {
  return renderToStaticMarkup(
    <I18nProvider lang={lang}>
      <DateFmtProvider dateFormat="en-GB" timezone="UTC">
        {node}
      </DateFmtProvider>
    </I18nProvider>,
  );
}

function render(
  quarantined: QuarantinedReminder[],
  lang: "en" | "ru" = "en",
): string {
  return wrap(
    <QuarantinedReminderCard
      quarantined={quarantined}
      nowMs={NOW}
      emptyText="Nothing quarantined."
    />,
    lang,
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
  // quarantine and nobody can see it. What lets an admin pick it out has to be
  // on its row without opening the payload.
  test("shows what identifies a record on its row", () => {
    const html = render([record()]);
    expect(html).toContain("buy milk");
    expect(html).toContain("Does not match the schema · Yesterday, ");
  });

  test("counts the retention window down in days", () => {
    // One day into a 30-day window.
    expect(render([record()])).toContain(">29 days<");
    const lastDay = record({
      quarantinedAtMs: NOW - QUARANTINE_TTL_MS + 3_600_000,
    });
    expect(render([lastDay])).toContain(">1 day<");
    const stale = render([
      record({ quarantinedAtMs: NOW - QUARANTINE_TTL_MS - 1 }),
    ]);
    expect(stale).toContain(">Expired<");
    expect(stale).not.toContain("days");
  });

  test("falls back to the id when no text survived", () => {
    const html = render([
      record({ raw: "{not json at all", reason: "invalid_json" }),
    ]);
    expect(html).toContain("ID r1");
    expect(html).toContain("Not valid JSON");
    expect(html).not.toContain("buy milk");
  });

  test("keeps the payload out of the list", () => {
    const html = render([record()]);
    expect(html).not.toContain("<pre");
    expect(html).not.toContain('role="dialog"');
  });

  test("reads as nothing quarantined when the quarantine is empty", () => {
    const html = render([]);
    expect(html).toContain("Nothing quarantined.");
    expect(html).not.toContain("days");
  });

  test("takes its labels from the catalogue, not from English literals", () => {
    const html = render([record()], "ru");
    expect(html).toContain("Не соответствует схеме · Вчера, ");
    expect(html).toContain(">29 дней<");
  });
});

describe("PayloadSheet", () => {
  const open = (r: QuarantinedReminder, lang: "en" | "ru" = "en") =>
    wrap(<PayloadSheet record={r} onClose={() => {}} />, lang);

  test("lists user, id and expiry above the pretty-printed payload", () => {
    const html = open(record());
    expect(html).toContain("Payload");
    expect(html).toMatch(/>User<[\s\S]*>u42</);
    expect(html).toMatch(/>ID<[\s\S]*>r1</);
    // Quarantined a day ago, kept 30 days.
    const expires = formatShortDateTime(
      NOW + 29 * 86_400_000,
      Date.now(),
      "en-GB",
      "UTC",
      { today: "Today", yesterday: "Yesterday", tomorrow: "Tomorrow" },
    );
    expect(html).toMatch(new RegExp(`>Expires<[\\s\\S]*${expires}`));
    expect(html).toContain("<pre");
    expect(html).toContain("&quot;text&quot;: &quot;buy milk&quot;");
    expect(html.indexOf("<pre")).toBeLessThan(html.indexOf(">Copy<"));
  });

  test("drops the user row when the payload names none", () => {
    const html = open(record({ raw: "{not json", reason: "invalid_json" }));
    expect(html).not.toContain(">User<");
    expect(html).toContain("{not json");
  });

  test("closes with Done and speaks the viewer's language", () => {
    const html = open(record(), "ru");
    expect(html).toContain(">Данные<");
    expect(html).toContain(">Готово<");
    expect(html).toContain(">Пользователь<");
    expect(html).toContain(">Копировать<");
  });
});
