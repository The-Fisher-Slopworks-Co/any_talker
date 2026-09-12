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
  // A line at the bottom of the form went unnoticed: the status is a toast
  // pinned to the top of the viewport, visible however far the form scrolls.
  test("is a toast pinned to the top of the viewport", () => {
    const html = render("saving");
    expect(html).toContain("fixed");
    expect(html).toContain("top-[");
  });

  test("is hidden while idle", () => {
    const html = render("idle");
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("opacity-0");
  });

  test("reports saving and saved", () => {
    const saving = render("saving");
    expect(saving).toContain("Saving…");
    expect(saving).toContain('aria-hidden="false"');
    expect(render("saved")).toContain("Saved");
  });

  // A rejected change must not pass silently: with no save button, this toast
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
