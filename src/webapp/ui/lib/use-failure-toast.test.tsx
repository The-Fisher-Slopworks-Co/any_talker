// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import { useFailureToast } from "./use-failure-toast";

describe("useFailureToast", () => {
  const { window, document } = parseHTML(
    "<!doctype html><html><body></body></html>",
  );
  Object.assign(globalThis, { window, document });
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

  const SHOWN_MS = 300;
  const wait = (ms: number) =>
    act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  test("a second failure keeps the toast up for the full time again", async () => {
    let toast: ReturnType<typeof useFailureToast> | null = null;
    function Probe() {
      toast = useFailureToast(SHOWN_MS);
      return null;
    }
    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(<Probe />));
    expect(toast!.status).toBe("idle");

    await act(async () => toast!.fail());
    expect(toast!.status).toBe("failed");
    await wait(SHOWN_MS / 2);
    await act(async () => toast!.fail());
    // Past the first failure's time, but within the second's.
    await wait(SHOWN_MS * 0.75);
    expect(toast!.status).toBe("failed");
    await wait(SHOWN_MS);
    expect(toast!.status).toBe("idle");
    await act(async () => root.unmount());
  });
});
