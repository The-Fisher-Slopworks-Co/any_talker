// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../i18n-context";
import type { SaveStatus as Status } from "../lib/use-autosave";
import { SaveStatus } from "./save-status";

function render(status: Status, lang: "en" | "ru" = "en"): string {
  return renderToStaticMarkup(
    <I18nProvider lang={lang}>
      <SaveStatus status={status} />
    </I18nProvider>,
  );
}

describe("SaveStatus", () => {
  test("shows nothing while idle", () => {
    expect(render("idle")).toBe("");
  });

  test("reports saving and saved", () => {
    expect(render("saving")).toContain("Saving…");
    expect(render("saved")).toContain("Saved");
  });

  // A rejected change must not pass silently: with no save button, this line
  // is the only sign the value was not stored.
  test("flags a failed save as an error", () => {
    const html = render("failed");
    expect(html).toContain("Couldn&#x27;t save");
    expect(html).toContain("text-tg-destructive");
  });

  test("is translated", () => {
    expect(render("failed", "ru")).toContain("Не удалось сохранить");
  });
});
