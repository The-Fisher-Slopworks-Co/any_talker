// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

export function useLoadable<T>(
  load: () => Promise<T>,
  deps: unknown[],
): {
  data: T | null;
  setData: Dispatch<SetStateAction<T | null>>;
  error: boolean;
} {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setError(false);
    setData(null);
    load()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, setData, error };
}
