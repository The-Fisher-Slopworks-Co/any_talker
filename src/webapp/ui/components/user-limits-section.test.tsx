// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../i18n-context";
import { DateFmtProvider } from "../datetime-context";
import type { UsageStatus, WindowStatus } from "../../../ratelimit/window";
import { UserLimitsSection, usedPercent } from "./user-limits-section";

const win = (used: number, limit: number): WindowStatus => ({
  used,
  limit,
  remaining: Math.max(0, limit - used),
  windowStart: 0,
  resetMs: 0,
});

describe("usedPercent", () => {
  test("rounds to a whole percent", () => {
    expect(usedPercent(win(0.04, 1))).toBe(4);
    expect(usedPercent(win(0, 1))).toBe(0);
  });

  test("shows any spend as at least 1%", () => {
    expect(usedPercent(win(0.002, 1))).toBe(1);
  });

  test("does not cap an overrun", () => {
    expect(usedPercent(win(1.2, 1))).toBe(120);
  });

  test("a window with no budget is fully used", () => {
    expect(usedPercent(win(0, 0))).toBe(100);
  });
});

function render(usage: UsageStatus | null): string {
  return renderToStaticMarkup(
    <I18nProvider lang="en">
      <DateFmtProvider dateFormat="iso" timezone="UTC">
        <UserLimitsSection userId="1" usage={usage} onUsage={() => {}} />
      </DateFmtProvider>
    </I18nProvider>,
  );
}

describe("UserLimitsSection markup", () => {
  test("draws both windows as bars with their reset times", () => {
    const html = render({
      fiveHour: { ...win(0.4, 1), resetMs: Date.UTC(2099, 0, 2, 3, 4) },
      weekly: win(0.24, 1),
    });
    expect(html).toContain("Limits");
    expect(html).toContain("5-Hour Window");
    expect(html).toContain("40% used");
    expect(html).toContain("Weekly Window");
    expect(html).toContain("24% used");
    expect(html).toContain("Resets");
    expect(html).toContain("Reset Usage");
  });

  test("offers the reset alone while the windows load", () => {
    const html = render(null);
    expect(html).toContain("Reset Usage");
    expect(html).not.toContain("progressbar");
  });
});
