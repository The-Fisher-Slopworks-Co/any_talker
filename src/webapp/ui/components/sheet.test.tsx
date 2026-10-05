// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  dragDismisses,
  Sheet,
  SheetButton,
  sheetCancel,
  sheetMotion,
  useSheet,
} from "./sheet";

describe("useSheet", () => {
  // The hook's callbacks do not depend on a live render, so a server render
  // is enough to get hold of them.
  function hook(onClose: () => void) {
    let result!: ReturnType<typeof useSheet>;
    function Probe() {
      result = useSheet(onClose);
      return null;
    }
    renderToStaticMarkup(<Probe />);
    return result;
  }

  test("hands control back once the slide-out is over, however often asked", async () => {
    let closed = 0;
    const { cancel, dismiss } = hook(() => closed++);
    cancel();
    cancel();
    dismiss(() => closed++);
    expect(closed).toBe(0);
    await Bun.sleep(450);
    expect(closed).toBe(1);
  });

  test("starts out open", () => {
    expect(hook(() => {}).closing).toBe(false);
  });
});

describe("Sheet", () => {
  function render(closing: boolean): string {
    return renderToStaticMarkup(
      <Sheet
        title="Payload"
        closing={closing}
        onCancel={() => {}}
        trailing={<SheetButton onClick={() => {}}>Done</SheetButton>}
      >
        <p>body</p>
      </Sheet>,
    );
  }

  test("puts the title and the header buttons around its content", () => {
    const html = render(false);
    expect(html).toContain('role="dialog"');
    expect(html.indexOf("Payload")).toBeLessThan(html.indexOf("Done"));
    expect(html.indexOf("Done")).toBeLessThan(html.indexOf("<p>body</p>"));
  });

  test("names the dialog by its title", () => {
    expect(render(false)).toContain('aria-label="Payload"');
  });

  test("stops taking taps once it is sliding away", () => {
    expect(render(false)).not.toContain("pointer-events-none");
    expect(render(true)).toContain("pointer-events-none");
  });
});

describe("sheetCancel", () => {
  const onCancel = () => {};

  test("passes the cancel through while the sheet is idle", () => {
    expect(sheetCancel(onCancel, false, false)).toBe(onCancel);
  });

  // Escape during a save would close the sheet mid-request; during the
  // slide-out it would hand control back a second time.
  test("does nothing while a save is in flight or the sheet slides away", () => {
    for (const [busy, closing] of [
      [true, false],
      [false, true],
      [true, true],
    ] as const) {
      const gated = sheetCancel(onCancel, busy, closing);
      expect(gated).not.toBe(onCancel);
      expect(gated()).toBeUndefined();
    }
  });
});

describe("sheet motion", () => {
  const classes = (s: string) => s.split(/\s+/).filter(Boolean);

  test("slides in from the bottom over a fading-in dim", () => {
    const { backdrop, panel } = sheetMotion(false);
    expect(classes(backdrop)).toContain("starting:opacity-0");
    expect(classes(panel)).toContain("motion-safe:starting:translate-y-full");
    expect(classes(backdrop)).not.toContain("opacity-0");
    expect(panel).not.toMatch(/(^|\s)motion-safe:translate-y-full/);
  });

  test("slides back out when closing", () => {
    const { backdrop, panel } = sheetMotion(true);
    expect(classes(backdrop)).toContain("opacity-0");
    expect(classes(panel)).toContain("motion-safe:translate-y-full");
  });

  test("only fades with reduced motion", () => {
    for (const closing of [false, true]) {
      const { panel } = sheetMotion(closing);
      for (const cls of classes(panel).filter((c) => c.includes("translate-y")))
        expect(cls.startsWith("motion-safe:")).toBe(true);
      expect(panel).toContain(
        closing
          ? "motion-reduce:opacity-0"
          : "motion-reduce:starting:opacity-0",
      );
    }
  });
});

describe("pulling a sheet down", () => {
  const height = 600;

  test("closes once pulled past a third of the sheet", () => {
    expect(dragDismisses(150, 0, height)).toBe(false);
    expect(dragDismisses(201, 0, height)).toBe(true);
  });

  test("closes on a short but fast flick", () => {
    expect(dragDismisses(40, 1.2, height)).toBe(true);
  });

  test("snaps back from a slow nudge or a twitch", () => {
    expect(dragDismisses(40, 0.2, height)).toBe(false);
    expect(dragDismisses(5, 2, height)).toBe(false);
  });
});
