// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../i18n-context";
import { DateFmtProvider } from "../datetime-context";
import { UsageCard, formatUsedPercent } from "./usage-card";
import type { UsageStatus, WindowStatus } from "../../../ratelimit/window";

const win = (used: number, limit: number): WindowStatus => ({
  used,
  limit,
  remaining: Math.max(0, limit - used),
  windowStart: Date.UTC(2026, 9, 1, 17, 30),
  resetMs: Date.UTC(2026, 9, 1, 22, 30),
});

const usage: UsageStatus = {
  fiveHour: win(0.04, 1),
  weekly: win(0.002, 1),
};

function render(percent: boolean): string {
  return renderToStaticMarkup(
    <I18nProvider lang="en">
      <DateFmtProvider dateFormat="iso" timezone="UTC">
        <UsageCard usage={usage} percent={percent} />
      </DateFmtProvider>
    </I18nProvider>,
  );
}

describe("formatUsedPercent", () => {
  test("rounds to a whole percent", () => {
    expect(formatUsedPercent(win(0.04, 1))).toBe("4%");
    expect(formatUsedPercent(win(0, 1))).toBe("0%");
  });

  test("shows any spend as at least 1%", () => {
    expect(formatUsedPercent(win(0.002, 1))).toBe("1%");
  });

  test("keeps an overrun above 100%", () => {
    expect(formatUsedPercent(win(1.2, 1))).toBe("120%");
  });

  test("treats a non-positive limit as full", () => {
    expect(formatUsedPercent(win(0, 0))).toBe("100%");
  });
});

describe("UsageCard markup", () => {
  test("percent mode shows shares, not dollars", () => {
    const html = render(true);
    expect(html).toContain("4%");
    expect(html).toContain("1%");
    expect(html).not.toContain("$");
  });

  test("default mode keeps used / limit in USD", () => {
    const html = render(false);
    expect(html).toContain("$0.0400 / $1.0000");
    expect(html).toContain("$0.0020 / $1.0000");
  });
});
