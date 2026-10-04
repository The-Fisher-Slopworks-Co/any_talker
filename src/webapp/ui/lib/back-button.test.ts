// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { createBackStack } from "./back-button";

function fakeButton() {
  const clicks: (() => void)[] = [];
  const button = {
    visible: false,
    show: () => void (button.visible = true),
    hide: () => void (button.visible = false),
    onClick: (cb: () => void) => void clicks.push(cb),
    // What Telegram does on a tap or an Android back gesture: every
    // registered callback runs.
    press: () => clicks.forEach((cb) => cb()),
  };
  return button;
}

describe("back stack", () => {
  test("only the newest handler runs", () => {
    const button = fakeButton();
    const stack = createBackStack(button);
    const calls: string[] = [];
    stack.push(() => calls.push("screen"));
    stack.push(() => calls.push("sheet"));
    button.press();
    expect(calls).toEqual(["sheet"]);
  });

  test("once the sheet is gone, back goes to the screen again", () => {
    const button = fakeButton();
    const stack = createBackStack(button);
    const calls: string[] = [];
    stack.push(() => calls.push("screen"));
    const closeSheet = stack.push(() => calls.push("sheet"));
    closeSheet();
    button.press();
    expect(calls).toEqual(["screen"]);
  });

  test("shows the button while anything listens and hides it after", () => {
    const button = fakeButton();
    const stack = createBackStack(button);
    const off = stack.push(() => {});
    expect(button.visible).toBe(true);
    off();
    expect(button.visible).toBe(false);
  });

  test("removing a lower handler leaves the top one in charge", () => {
    const button = fakeButton();
    const stack = createBackStack(button);
    const calls: string[] = [];
    const offScreen = stack.push(() => calls.push("screen"));
    stack.push(() => calls.push("sheet"));
    offScreen();
    button.press();
    expect(calls).toEqual(["sheet"]);
    expect(button.visible).toBe(true);
  });

  test("works without Telegram", () => {
    const stack = createBackStack(null);
    expect(() => stack.push(() => {})()).not.toThrow();
  });
});
