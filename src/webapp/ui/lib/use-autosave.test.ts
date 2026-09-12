// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { createAutosaver, type SaveStatus } from "./use-autosave";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(send: (patch: string) => Promise<string>) {
  const saved: string[] = [];
  const failed: string[] = [];
  const statuses: SaveStatus[] = [];
  const save = createAutosaver({
    send,
    onSaved: (r) => saved.push(r),
    onFailed: (p) => failed.push(p),
    onStatus: (s) => statuses.push(s),
  });
  return { save, saved, failed, statuses };
}

describe("createAutosaver", () => {
  // Two quick changes must not race: the second request only starts once the
  // first has answered, so its (newer) response is the one applied last.
  test("sends patches one at a time, in order", async () => {
    const first = deferred<string>();
    const sent: string[] = [];
    const { save, saved } = setup((p) => {
      sent.push(p);
      return p === "a" ? first.promise : Promise.resolve(p);
    });

    void save("a");
    const done = save("b");
    await Promise.resolve();
    expect(sent).toEqual(["a"]);

    first.resolve("a");
    await done;
    expect(sent).toEqual(["a", "b"]);
    expect(saved).toEqual(["a", "b"]);
  });

  test("reports saving, then saved once the burst settles", async () => {
    const { save, statuses } = setup((p) => Promise.resolve(p));
    void save("a");
    await save("b");
    expect(statuses).toEqual(["saving", "saving", "saved"]);
  });

  test("a rejected patch is handed back and fails the burst", async () => {
    const { save, saved, failed, statuses } = setup((p) =>
      p === "bad" ? Promise.reject(new Error("400")) : Promise.resolve(p),
    );
    void save("bad");
    await save("ok");
    expect(failed).toEqual(["bad"]);
    expect(saved).toEqual(["ok"]);
    expect(statuses.at(-1)).toBe("failed");
  });

  test("a failure does not stick to the next burst", async () => {
    const { save, statuses } = setup((p) =>
      p === "bad" ? Promise.reject(new Error("400")) : Promise.resolve(p),
    );
    await save("bad");
    await save("ok");
    expect(statuses).toEqual(["saving", "failed", "saving", "saved"]);
  });
});
