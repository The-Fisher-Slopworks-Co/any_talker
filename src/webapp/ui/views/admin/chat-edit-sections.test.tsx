// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../../i18n-context";
import { DEFAULT_SETTINGS } from "../../../../shared/types";
import { chatFormFromSettings } from "./chat-edit-form";
import {
  AiSettingsSection,
  KeywordFilterSection,
  ModelsSection,
  SystemPromptSection,
} from "./chat-edit-sections";

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

function renderOwn(
  Section: typeof SystemPromptSection,
  settings: Parameters<typeof chatFormFromSettings>[0],
): string {
  return renderToStaticMarkup(
    <I18nProvider lang="en">
      <Section
        form={chatFormFromSettings(settings, GLOBAL)}
        set={() => {}}
        commit={() => {}}
        global={GLOBAL}
      />
    </I18nProvider>,
  );
}

test("a chat without its own prompt shows the switch off and the global size", () => {
  const html = renderOwn(SystemPromptSection, {});
  expect(html).toContain("Own System Prompt");
  expect(html).toContain('aria-checked="false"');
  expect(html).not.toContain("<textarea");
  expect(html).toContain(`Global (${GLOBAL.systemPrompt.length} chars)`);
});

test("an own prompt opens its editor and the copy action in the same card", () => {
  const html = renderOwn(SystemPromptSection, { systemPrompt: "Be brief" });
  expect(html).toContain('aria-checked="true"');
  expect(html).toContain(">Be brief</textarea>");
  expect(html.match(/class="card /g)).toHaveLength(1);
  expect(html).toContain("Copy for Optimization");
});

test("own models name the global ones while off", () => {
  const html = renderOwn(ModelsSection, {});
  expect(html).toContain("Own Models");
  expect(html).toContain(`Global: ${GLOBAL.models.join(", ")}`);
});

test("the keyword filter keeps its list in the card whether on or off", () => {
  const off = renderOwn(KeywordFilterSection, {});
  expect(off).toContain("Keyword Filter");
  expect(off).toContain('aria-checked="false"');
  expect(off).toContain("<textarea");
  const on = renderOwn(KeywordFilterSection, {
    keywordFilter: { enabled: true, keywords: ["spam", "ads"] },
  });
  expect(on).toContain('aria-checked="true"');
  expect(on).toContain(">spam, ads</textarea>");
});
