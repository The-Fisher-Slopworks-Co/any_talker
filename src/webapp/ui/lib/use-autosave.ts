// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useEffect, useRef, useState } from "react";

export type SaveStatus = "idle" | "saving" | "saved" | "failed";

// How long the outcome of a burst stays on screen before the toast hides; a
// failure lingers longer, since the change it reports did not stick.
const OUTCOME_SHOWN_MS = { saved: 500, failed: 5000 };

// Sends every change as its own patch, one request at a time in the order the
// changes were made, so an older response can never land after a newer one and
// roll the form back. The status describes the whole burst: "saving" while any
// patch is queued, then "saved" — or "failed" if any patch in it was rejected.
export function createAutosaver<P, R>({
  send,
  onSaved,
  onFailed,
  onStatus,
}: {
  send: (patch: P) => Promise<R>;
  onSaved: (result: R) => void;
  onFailed: (patch: P) => void;
  onStatus: (status: SaveStatus) => void;
}): (patch: P) => Promise<void> {
  let tail: Promise<void> = Promise.resolve();
  let pending = 0;
  let failed = false;
  return (patch) => {
    if (pending === 0) failed = false;
    pending++;
    onStatus("saving");
    tail = tail.then(async () => {
      try {
        onSaved(await send(patch));
      } catch {
        failed = true;
        onFailed(patch);
      }
      pending--;
      if (pending === 0) onStatus(failed ? "failed" : "saved");
    });
    return tail;
  };
}

export function useAutosave<P, R>(handlers: {
  send: (patch: P) => Promise<R>;
  onSaved: (result: R) => void;
  onFailed: (patch: P) => void;
}): { save: (patch: P) => void; status: SaveStatus } {
  const [status, setStatus] = useState<SaveStatus>("idle");
  // The saver is created once, so it reads the handlers through a ref to see
  // the latest closures rather than the first render's.
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });
  const [save] = useState(() =>
    createAutosaver<P, R>({
      send: (p) => latest.current.send(p),
      onSaved: (r) => latest.current.onSaved(r),
      onFailed: (p) => latest.current.onFailed(p),
      onStatus: setStatus,
    }),
  );

  useEffect(() => {
    if (status !== "saved" && status !== "failed") return;
    const timer = setTimeout(() => setStatus("idle"), OUTCOME_SHOWN_MS[status]);
    return () => clearTimeout(timer);
  }, [status]);

  return {
    save: (patch) => {
      void save(patch);
    },
    status,
  };
}
