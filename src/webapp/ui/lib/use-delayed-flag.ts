// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useEffect, useState } from "react";

// Shorter waits read as instant: a "Loading…" shown for them is only a flash.
const NOTICEABLE_WAIT_MS = 250;

// `flag`, but turning on only once it has stayed on for `delayMs`; it turns
// off at once. For a loading label that should not blink on a quick response.
export function useDelayedFlag(
  flag: boolean,
  delayMs = NOTICEABLE_WAIT_MS,
): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!flag) {
      setShown(false);
      return;
    }
    const timer = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(timer);
  }, [flag, delayMs]);
  return flag && shown;
}
