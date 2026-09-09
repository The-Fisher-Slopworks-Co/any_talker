// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// A server-render smoke test, like models-card.test.tsx: rendering to a string
// is enough to catch what a typecheck cannot — a setting that is stored and
// enforced but never reaches the screen.

import { test, expect, describe } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../i18n-context";
import { ReminderCapField } from "./reminder-cap-field";

function render(value: number, lang: "en" | "ru" = "en"): string {
  return renderToStaticMarkup(
    <I18nProvider lang={lang}>
      <ReminderCapField value={value} onChange={() => {}} />
    </I18nProvider>,
  );
}

describe("ReminderCapField", () => {
  // The regression this whole field exists for: `maxRemindersPerUser` was
  // enforceable and settable over the API, but nowhere in the admin UI — a
  // stale stored value could not even be seen, let alone corrected.
  test("shows the stored cap in an editable input", () => {
    const html = render(50);
    expect(html).toContain("Max reminders");
    const input = /<input[^>]*>/.exec(html)?.[0];
    expect(input).toBeDefined();
    expect(input).toContain('value="50"');
    expect(input).toContain('type="number"');
  });

  // A cap below 1 blocks every reminder, and the API rejects it outright; the
  // stepper must not be able to walk the field down there.
  test("does not let the stepper go below one reminder", () => {
    expect(/<input[^>]*\bmin="1"/.test(render(5))).toBe(true);
  });

  test("is translated", () => {
    expect(render(5, "ru")).toContain("Максимум напоминаний");
  });
});
