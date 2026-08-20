// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// A server-render smoke test, in the same spirit as `models-card.test.tsx`:
// rendering to a string is enough to prove the bars are actually drawn at the
// right width — and, more importantly here, that no token count can reach the
// markup.

import { test, expect, describe } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../i18n-context";
import { UsageHeader } from "./usage-header";
import type { UsageShare } from "../../../ratelimit/share";

const HOUR = 60 * 60 * 1000;

const share = (over: Partial<UsageShare> = {}): UsageShare => ({
  fiveHour: {
    usedPercent: 25,
    remainingPercent: 75,
    resetMs: Date.now() + 2 * HOUR,
  },
  weekly: {
    usedPercent: 60,
    remainingPercent: 40,
    resetMs: Date.now() + 72 * HOUR,
  },
  exempt: false,
  ...over,
});

function render(usage: UsageShare | null, lang: "en" | "ru" = "en"): string {
  return renderToStaticMarkup(
    <I18nProvider lang={lang}>
      <UsageHeader usage={usage} />
    </I18nProvider>,
  );
}

describe("UsageHeader markup", () => {
  test("renders nothing until the usage lands", () => {
    expect(render(null)).toBe("");
  });

  test("draws one bar per window, at the used percentage", () => {
    const html = render(share());
    const widths = [...html.matchAll(/width:\s*([\d.]+)%/g)].map((m) => m[1]);
    expect(widths).toEqual(["25", "60"]);
  });

  test("labels both windows and shows what's left", () => {
    const html = render(share());
    expect(html).toContain("5 h");
    expect(html).toContain("7 d");
    expect(html).toContain("75% left");
    expect(html).toContain("40% left");
  });

  test("says when each window resets", () => {
    const html = render(share());
    expect(html).toContain("~2 h until reset");
    expect(html).toContain("~3 d until reset");
  });

  test("exposes the share to assistive tech as a progressbar", () => {
    const html = render(share());
    const values = [...html.matchAll(/aria-valuenow="(\d+)"/g)].map((m) => m[1]);
    expect(values).toEqual(["25", "60"]);
  });

  test("shows no bars, and no percentages, for an exempt owner", () => {
    const html = render(share({ exempt: true }));
    expect(html).toContain("No limits apply to you.");
    expect(html).not.toContain("aria-valuenow");
    expect(html).not.toContain("%");
  });

  test("translates", () => {
    const html = render(share(), "ru");
    expect(html).toContain("Твои лимиты");
    expect(html).toContain("осталось 75%");
  });

  test("turns the bar destructive once a window is nearly spent", () => {
    const calm = render(share());
    const hot = render(
      share({
        fiveHour: {
          usedPercent: 95,
          remainingPercent: 5,
          resetMs: Date.now() + HOUR,
        },
      }),
    );
    expect(calm).not.toContain("--color-tg-destructive");
    expect(hot).toContain("--color-tg-destructive");
  });
});
