// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../../i18n-context";
import { DEFAULT_SETTINGS } from "../../../../shared/types";
import { chatFormFromSettings } from "./chat-edit-form";
import { AiSettingsSection } from "./chat-edit-sections";

const GLOBAL = {
  ...DEFAULT_SETTINGS,
  timezone: "UTC",
  providerSort: null,
  serviceTier: null,
};

function render(settings: Parameters<typeof chatFormFromSettings>[0]): string {
  return renderToStaticMarkup(
    <I18nProvider lang="en">
      <AiSettingsSection
        form={chatFormFromSettings(settings, GLOBAL)}
        set={() => {}}
        commit={() => {}}
        global={GLOBAL}
      />
    </I18nProvider>,
  );
}

test("shows every setting as inherited while the chat overrides nothing", () => {
  const html = render({});
  expect(html).toContain("AI Settings");
  for (const label of [
    "Timezone",
    "Sort Providers By",
    "Provider",
    "Service Tier",
  ])
    expect(html).toContain(`>${label}</span>`);
  expect(html).toContain("Global (UTC)");
  expect(html).toContain("Global (Auto)");
  expect(html).toContain("Global (Default)");
});

test("selects the chat's own choices", () => {
  const html = render({
    timezone: "Europe/Berlin",
    providerSort: "latency",
    serviceTier: "flex",
  });
  expect(html).toContain('<option value="Europe/Berlin" selected="">');
  expect(html).toContain(
    '<option value="latency" selected="">Latency</option>',
  );
  expect(html).toContain('<option value="flex" selected="">Flex</option>');
});
