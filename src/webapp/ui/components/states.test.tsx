// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../i18n-context";
import { LoadingState } from "./states";

const render = (text?: string) =>
  renderToStaticMarkup(
    <I18nProvider lang="en">
      {text === undefined ? <LoadingState /> : <LoadingState text={text} />}
    </I18nProvider>,
  );

describe("LoadingState", () => {
  test("holds its place blank before the wait is noticeable", () => {
    const html = render();
    expect(html).not.toContain("Loading");
    expect(html).toContain("py-20");
  });

  test("a message shows at once", () => {
    expect(render("Not found.")).toContain("Not found.");
  });
});
