// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import { useDelayedFlag } from "./use-delayed-flag";

describe("useDelayedFlag", () => {
  const { window, document } = parseHTML(
    "<!doctype html><html><body></body></html>",
  );
  Object.assign(globalThis, { window, document });
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

  const DELAY_MS = 60;
  const wait = (ms: number) =>
    act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  function mount() {
    let shown: boolean | null = null;
    function Probe({ flag }: { flag: boolean }) {
      shown = useDelayedFlag(flag, DELAY_MS);
      return null;
    }
    const root = createRoot(document.createElement("div"));
    return {
      shown: () => shown,
      render: (flag: boolean) =>
        act(async () => root.render(<Probe flag={flag} />)),
      unmount: () => act(async () => root.unmount()),
    };
  }

  test("stays off when the flag drops before the delay", async () => {
    const probe = mount();
    await probe.render(true);
    expect(probe.shown()).toBe(false);
    await wait(DELAY_MS / 2);
    await probe.render(false);
    await wait(DELAY_MS);
    expect(probe.shown()).toBe(false);
    await probe.unmount();
  });

  test("turns on after the delay and off at once", async () => {
    const probe = mount();
    await probe.render(true);
    await wait(DELAY_MS * 1.5);
    expect(probe.shown()).toBe(true);
    await probe.render(false);
    expect(probe.shown()).toBe(false);
    await probe.unmount();
  });

  test("a second wait starts the delay over", async () => {
    const probe = mount();
    await probe.render(true);
    await wait(DELAY_MS * 1.5);
    await probe.render(false);
    await probe.render(true);
    expect(probe.shown()).toBe(false);
    await wait(DELAY_MS * 1.5);
    expect(probe.shown()).toBe(true);
    await probe.unmount();
  });
});
