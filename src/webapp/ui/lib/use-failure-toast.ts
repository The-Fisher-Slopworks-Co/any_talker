// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useCallback, useEffect, useState } from "react";
import type { SaveStatus } from "./use-autosave";

// How long the failure toast stays, as after an autosave.
const FAILURE_SHOWN_MS = 5000;

// For actions that are not an autosave but fail the same way — a swiped-away
// row the server refused to delete. `status` feeds `SaveStatus`; `fail` raises
// it and it hides itself again.
export function useFailureToast(): { status: SaveStatus; fail: () => void } {
  const [status, setStatus] = useState<SaveStatus>("idle");
  useEffect(() => {
    if (status !== "failed") return;
    const timer = setTimeout(() => setStatus("idle"), FAILURE_SHOWN_MS);
    return () => clearTimeout(timer);
  }, [status]);
  const fail = useCallback(() => setStatus("failed"), []);
  return { status, fail };
}
