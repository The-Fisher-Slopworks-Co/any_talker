// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../../i18n-context";
import { DEFAULT_SETTINGS } from "../../../../shared/types";
import { RemindersTab } from "./reminders-tab";

test("the per-user cap autosaves: no header, no Save button, one footer", () => {
  const html = renderToStaticMarkup(
    <I18nProvider lang="en">
      <RemindersTab
        settings={{ ...DEFAULT_SETTINGS, maxRemindersPerUser: 7 }}
        onSaved={() => {}}
        onUserClick={() => {}}
      />
    </I18nProvider>,
  );
  expect(html).toContain("Max per User");
  expect(html).toContain('value="7"');
  expect(html).toContain("Across all characters.");
  expect(html).not.toContain("Per-User Limit");
  expect(html).not.toContain(">Save<");
  expect(html).not.toContain(">Saved<");
});
