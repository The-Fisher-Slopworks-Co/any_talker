// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { afterAll, describe, expect, setSystemTime, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { parseHTML } from "linkedom";
import { preload, useLoadable } from "./use-loadable";

describe("useLoadable", () => {
  const { window, document } = parseHTML(
    "<!doctype html><html><body></body></html>",
  );
  Object.assign(globalThis, { window, document });
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

  // A load the test answers by hand, one per call.
  function deferredLoads() {
    const pending: ((v: string[]) => void)[] = [];
    const load = () =>
      new Promise<string[]>((resolve) => {
        pending.push(resolve);
      });
    const answer = (v: string[]) =>
      act(async () => {
        pending.shift()!(v);
      });
    return { load, answer, pending };
  }

  type Hook = ReturnType<typeof useLoadable<string[]>>;
  let hook: Hook | null = null;
  // Every frame the probe rendered, to catch a loading flash between two.
  let frames: (string[] | null)[] = [];
  function Probe({
    k,
    load,
    once = false,
  }: {
    k: string;
    load: () => Promise<string[]>;
    once?: boolean;
  }) {
    hook = useLoadable({ key: k, load, once });
    frames.push(hook.data);
    return null;
  }

  async function mount(k: string, load: () => Promise<string[]>, once = false) {
    frames = [];
    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(<Probe k={k} load={load} once={once} />));
    return root;
  }
  const rerender = (root: Root, k: string, load: () => Promise<string[]>) => {
    frames = [];
    return act(async () => root.render(<Probe k={k} load={load} />));
  };

  // Moves the clock past the window in which a load counts as just done.
  let now = Date.now();
  const later = () => setSystemTime((now += 3000));
  afterAll(() => setSystemTime());

  test("a screen opened again shows its data at once and refreshes it", async () => {
    const { load, answer, pending } = deferredLoads();
    const first = await mount("t1", load);
    expect(hook!.data).toBeNull();
    await answer(["a"]);
    expect(hook!.data).toEqual(["a"]);
    await act(async () => first.unmount());
    later();

    const second = await mount("t1", load);
    expect(frames).toEqual([["a"]]);
    expect(pending).toHaveLength(1);
    await answer(["a", "b"]);
    expect(hook!.data).toEqual(["a", "b"]);
    await act(async () => second.unmount());
  });

  test("a new key keeps the old data up until its own arrives", async () => {
    const { load, answer } = deferredLoads();
    const root = await mount("t2:x", load);
    await answer(["x"]);

    await rerender(root, "t2:y", load);
    expect(frames).not.toContain(null);
    expect(hook!.data).toEqual(["x"]);
    await answer(["y"]);
    expect(hook!.data).toEqual(["y"]);

    // Back to a key seen before: its own data, not the one on screen.
    later();
    await rerender(root, "t2:x", load);
    expect(hook!.data).toEqual(["x"]);
    await answer(["x2"]);
    expect(hook!.data).toEqual(["x2"]);
    await act(async () => root.unmount());
  });

  test("a local change is kept over an older answer and on the next visit", async () => {
    const { load, answer } = deferredLoads();
    const first = await mount("t3", load);
    await answer(["a", "b"]);
    await act(async () => first.unmount());
    later();

    const second = await mount("t3", load);
    await act(async () =>
      hook!.setData((d) => d && d.filter((x) => x !== "b")),
    );
    // The refresh went out before the removal, so it still lists "b".
    await answer(["a", "b"]);
    expect(hook!.data).toEqual(["a"]);
    await act(async () => second.unmount());
    later();

    const third = await mount("t3", load);
    expect(frames[0]).toEqual(["a"]);
    await answer(["a"]);
    await act(async () => third.unmount());
  });

  test("a form's data is not kept once its screen is left", async () => {
    const { load, answer } = deferredLoads();
    const first = await mount("t4", load, true);
    await answer(["a"]);
    expect(hook!.data).toEqual(["a"]);
    await act(async () => first.unmount());

    // The form may have changed it since: the next open waits for the server.
    const second = await mount("t4", load, true);
    expect(frames).toEqual([null]);
    await answer(["b"]);
    expect(hook!.data).toEqual(["b"]);
    await act(async () => second.unmount());
  });

  // Whether a promise has settled, without waiting for it.
  async function settled(p: Promise<unknown>) {
    let done = false;
    void p.then(() => (done = true));
    await act(async () => {});
    return done;
  }

  test("a screen opened right after its preload shows it without asking again", async () => {
    const { load, answer, pending } = deferredLoads();
    const ready = preload({ key: "t5", load });
    expect(await settled(ready)).toBe(false);
    await answer(["a"]);
    expect(await settled(ready)).toBe(true);

    const root = await mount("t5", load);
    expect(frames).toEqual([["a"]]);
    expect(pending).toHaveLength(0);
    // Nor does a second preload of it.
    expect(await settled(preload({ key: "t5", load }))).toBe(true);
    expect(pending).toHaveLength(0);
    await act(async () => root.unmount());
  });

  test("a screen opened while its preload is out waits for that request", async () => {
    const { load, answer, pending } = deferredLoads();
    void preload({ key: "t6", load });
    const root = await mount("t6", load);
    expect(pending).toHaveLength(1);
    await answer(["a"]);
    expect(hook!.data).toEqual(["a"]);
    await act(async () => root.unmount());
  });

  test("an older copy is ready at once and refreshed behind it", async () => {
    const { load, answer, pending } = deferredLoads();
    void preload({ key: "t7", load });
    await answer(["a"]);
    later();
    expect(await settled(preload({ key: "t7", load }))).toBe(true);
    expect(pending).toHaveLength(1);

    const root = await mount("t7", load);
    expect(frames[0]).toEqual(["a"]);
    expect(pending).toHaveLength(1);
    await answer(["b"]);
    expect(hook!.data).toEqual(["b"]);
    await act(async () => root.unmount());
  });

  test("a form waits for a fresh copy rather than show an older one", async () => {
    const { load, answer } = deferredLoads();
    void preload({ key: "t8", load, once: true });
    await answer(["a"]);
    later();

    const ready = preload({ key: "t8", load, once: true });
    expect(await settled(ready)).toBe(false);
    const root = await mount("t8", load, true);
    expect(frames).toEqual([null]);
    await answer(["b"]);
    expect(await settled(ready)).toBe(true);
    expect(hook!.data).toEqual(["b"]);
    await act(async () => root.unmount());
  });

  test("a failed preload settles too, and the screen shows the failure", async () => {
    let fail = () => {};
    const load = () =>
      new Promise<string[]>((_, reject) => {
        fail = () => reject(new Error("down"));
      });
    const ready = preload({ key: "t9", load });
    const root = await mount("t9", load);
    await act(async () => fail());
    expect(await settled(ready)).toBe(true);
    expect(hook!.error).toBe(true);
    await act(async () => root.unmount());
  });
});
