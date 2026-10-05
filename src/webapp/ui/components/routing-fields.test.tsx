// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../i18n-context";
import { ProviderSortField } from "./provider-sort-field";
import { ReasoningEffortField } from "./reasoning-effort-field";
import { ServiceTierField } from "./service-tier-field";

function render(ui: React.ReactElement): string {
  return renderToStaticMarkup(<I18nProvider lang="en">{ui}</I18nProvider>);
}

const noop = () => {};

describe("routing pickers", () => {
  test("the sort is a picker row with the unset choice first", () => {
    const html = render(<ProviderSortField value="latency" onChange={noop} />);
    expect(html).toContain("Sort Providers By");
    expect(html).not.toContain("radiogroup");
    expect(html).toMatch(
      /<option value="">Auto<\/option><option value="price">Price<\/option><option value="throughput">Throughput<\/option><option value="latency" selected="">Latency/,
    );
  });

  test("the service tier is a picker row with the unset choice first", () => {
    const html = render(<ServiceTierField value={null} onChange={noop} />);
    expect(html).toContain("Service Tier");
    expect(html).not.toContain("radiogroup");
    expect(html).toMatch(
      /<option value="" selected="">Default<\/option><option value="flex">Flex<\/option><option value="priority">Priority/,
    );
  });

  test("the thinking level is labelled by its name, not by the command", () => {
    const html = render(<ReasoningEffortField value="low" onChange={noop} />);
    expect(html).toContain("Thinking Level");
    expect(html).not.toContain("/ask");
  });
});
