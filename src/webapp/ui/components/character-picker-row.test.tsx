// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../i18n-context";
import { CharacterPickerRow } from "./character-picker-row";

test("offers every bot as a choice and selects the current scope", () => {
  const html = renderToStaticMarkup(
    <I18nProvider lang="en">
      <CharacterPickerRow
        bots={[
          { botId: null, displayName: null, username: null },
          { botId: "2000001", displayName: "Captain Nemo", username: null },
        ]}
        scope="2000001"
        onChange={() => {}}
      />
    </I18nProvider>,
  );
  expect(html).toContain(">Character</span>");
  expect(html).toContain('<option value="main">Main Bot</option>');
  expect(html).toContain(
    '<option value="2000001" selected="">Captain Nemo</option>',
  );
});
