// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { createNavigator, holdTapped, trackTaps } from "./navigate";

// A navigator whose loads and wait the test settles by hand.
function setup() {
  const loads = new Map<string, { done: () => void; fail: () => void }>();
  const shown: string[] = [];
  const held: string[] = [];
  let endWait: (() => void) | null = null;
  const nav = createNavigator<string>({
    ready: (route) =>
      new Promise<void>((resolve, reject) => {
        loads.set(route, { done: resolve, fail: () => reject(new Error()) });
      }),
    show: (route) => shown.push(route),
    hold: () => {
      held.push("on");
      return () => held.push("off");
    },
    wait: (fn) => {
      endWait = fn;
      return () => (endWait = null);
    },
  });
  const tick = () => new Promise((r) => setTimeout(r, 0));
  return { nav, loads, shown, held, timeout: () => endWait?.(), tick };
}

describe("createNavigator", () => {
  test("stays on the current screen until the next one's data is in", async () => {
    const { nav, loads, shown, held, tick } = setup();
    nav.navigate("user");
    await tick();
    expect(shown).toEqual([]);
    expect(held).toEqual(["on"]);
    loads.get("user")!.done();
    await tick();
    expect(shown).toEqual(["user"]);
    expect(held).toEqual(["on", "off"]);
  });

  test("opens anyway once the wait runs out, and only once", async () => {
    const { nav, loads, shown, held, timeout, tick } = setup();
    nav.navigate("user");
    timeout();
    expect(shown).toEqual(["user"]);
    expect(held).toEqual(["on", "off"]);
    loads.get("user")!.done();
    await tick();
    expect(shown).toEqual(["user"]);
  });

  test("opens on a failed load too, for the screen to show it", async () => {
    const { nav, loads, shown, tick } = setup();
    nav.navigate("user");
    loads.get("user")!.fail();
    await tick();
    expect(shown).toEqual(["user"]);
  });

  test("the latest tap wins", async () => {
    const { nav, loads, shown, held, timeout, tick } = setup();
    nav.navigate("a");
    nav.navigate("b");
    expect(held).toEqual(["on", "off", "on"]);
    loads.get("a")!.done();
    await tick();
    expect(shown).toEqual([]);
    timeout();
    expect(shown).toEqual(["b"]);
    loads.get("b")!.done();
    await tick();
    expect(shown).toEqual(["b"]);
  });

  test("a cancelled navigation never opens", async () => {
    const { nav, loads, shown, held, timeout, tick } = setup();
    nav.navigate("a");
    nav.cancel();
    expect(held).toEqual(["on", "off"]);
    timeout();
    loads.get("a")!.done();
    await tick();
    expect(shown).toEqual([]);
  });
});

describe("holdTapped", () => {
  test("marks the button last clicked as pressed until released", () => {
    const { document, window } = parseHTML(
      "<!doctype html><html><body><button><span>Row</span></button></body></html>",
    );
    trackTaps(document);
    const button = document.querySelector("button")!;
    const span = document.querySelector("span")!;
    span.dispatchEvent(new window.Event("click", { bubbles: true }));
    const release = holdTapped();
    expect(button.hasAttribute("data-pressed")).toBe(true);
    release();
    expect(button.hasAttribute("data-pressed")).toBe(false);
  });
});
