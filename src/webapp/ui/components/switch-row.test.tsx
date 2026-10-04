// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SwitchRow } from "./switch-row";

describe("SwitchRow", () => {
  // The visible label sits outside the switch button, so VoiceOver needs it
  // repeated on the switch itself.
  test("labels the switch with the row's label", () => {
    const html = renderToStaticMarkup(
      <SwitchRow label="Owner Exempt" value={true} onChange={() => {}} />,
    );
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('aria-label="Owner Exempt"');
  });

  test("passes disabled through to the switch", () => {
    const html = renderToStaticMarkup(
      <SwitchRow label="X" value={false} onChange={() => {}} disabled />,
    );
    expect(html).toMatch(/<button[^>]*disabled/);
  });
});
