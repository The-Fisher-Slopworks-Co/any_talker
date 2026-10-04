// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { I18nProvider } from "../i18n-context";
import { DateFmtProvider } from "../datetime-context";
import { api } from "../api-client";
import type { LimitClass } from "../../../shared/types";
import type { WindowStatus } from "../../../ratelimit/window";
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

function render(initialClass: LimitClass | null, allowance: number): string {
  return renderToStaticMarkup(
    <I18nProvider lang="en">
      <DateFmtProvider dateFormat="iso" timezone="UTC">
        <UserLimitsSection
          userId="1"
          initialClass={initialClass}
          allowanceMonthUsd={allowance}
        />
      </DateFmtProvider>
    </I18nProvider>,
  );
}

describe("UserLimitsSection markup", () => {
  test("offers the class picker and a reset action in the Limits card", () => {
    const html = render(null, 0);
    expect(html).toContain("Limits");
    expect(html).toContain("Limit Class");
    expect(html).toContain("None");
    expect(html).toContain("Level 1");
    expect(html).toContain("Reset Usage");
  });

  test("shows the spent allowance only for a class or a past draw", () => {
    expect(render(null, 0)).not.toContain("Allowance Spent");
    expect(render(1, 0)).toContain("Allowance Spent");
    expect(render(null, 2.5)).toContain("Allowance Spent");
  });
});

// Picking in a real tree needs a DOM; linkedom does not feed React's event
// plumbing, so the handler React attached to the select is called directly.
describe("UserLimitsSection picks", () => {
  const { window, document } = parseHTML(
    "<!doctype html><html><body></body></html>",
  );
  Object.assign(globalThis, { window, document });
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

  type SelectProps = { value: string; onChange: (e: unknown) => void };
  // The mocks answer at once, so a run of microtask turns lets every save and
  // revert play out without depending on timers.
  const settle = async () => {
    for (let i = 0; i < 50; i++) await Promise.resolve();
  };

  test("a refused pick does not undo a newer one", async () => {
    const usage = { fiveHour: win(0, 1), weekly: win(0, 1) };
    let puts = 0;
    Object.assign(api, {
      getUserUsage: async () => ({ usage }),
      putUserLimitClass: async (_id: string, limitClass: LimitClass | null) => {
        if (puts++ === 0) throw new Error("refused");
        return { limitClass };
      },
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () =>
      root.render(
        <I18nProvider lang="en">
          <DateFmtProvider dateFormat="iso" timezone="UTC">
            <UserLimitsSection
              userId="1"
              initialClass={null}
              allowanceMonthUsd={0}
            />
          </DateFmtProvider>
        </I18nProvider>,
      ),
    );
    const select = container.querySelector("select")!;
    const key = Object.keys(select).find((k) => k.startsWith("__reactProps"))!;
    const props = () =>
      (select as unknown as Record<string, SelectProps>)[key]!;
    await act(async () => {
      props().onChange({ target: { value: "1" } });
      props().onChange({ target: { value: "2" } });
      props().onChange({ target: { value: "1" } });
      await settle();
    });
    // The refused first pick is the same class as the last one, yet newer picks
    // were made after it, so it must not put anything back.
    expect(props().value).toBe("1");
    await act(async () => root.unmount());
  });
});
