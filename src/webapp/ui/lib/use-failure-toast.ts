// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useCallback, useEffect, useState } from "react";
import type { SaveStatus } from "./use-autosave";

// How long the failure toast stays, as after an autosave.
const FAILURE_SHOWN_MS = 5000;

// For actions that are not an autosave but fail the same way — a swiped-away
// row the server refused to delete. `status` feeds `SaveStatus`; `fail` raises
// it and it hides itself again. Each failure is counted, so a second one while
// the toast is up keeps it for the full time again instead of the remainder.
export function useFailureToast(shownMs = FAILURE_SHOWN_MS): {
  status: SaveStatus;
  fail: () => void;
} {
  const [failure, setFailure] = useState<number | null>(null);
  useEffect(() => {
    if (failure === null) return;
    const timer = setTimeout(() => setFailure(null), shownMs);
    return () => clearTimeout(timer);
  }, [failure, shownMs]);
  const fail = useCallback(() => setFailure((n) => (n ?? 0) + 1), []);
  return { status: failure === null ? "idle" : "failed", fail };
}
