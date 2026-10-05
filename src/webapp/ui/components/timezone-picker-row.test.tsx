// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../i18n-context";
import { TimezonePickerRow } from "./timezone-picker-row";

function render(props: { emptyLabel?: string | null } = {}): string {
  return renderToStaticMarkup(
    <I18nProvider lang="en">
      <TimezonePickerRow value="Europe/Berlin" onChange={() => {}} {...props} />
    </I18nProvider>,
  );
}

describe("TimezonePickerRow empty choice", () => {
  test("offers Automatic by default", () => {
    expect(render()).toContain('<option value="">Automatic</option>');
  });

  test("names what null falls back to when the caller says so", () => {
    expect(render({ emptyLabel: "Global (UTC)" })).toContain(
      '<option value="">Global (UTC)</option>',
    );
  });

  test("has no empty choice for a zone that must be set", () => {
    expect(render({ emptyLabel: null })).not.toContain('<option value="">');
  });
});
