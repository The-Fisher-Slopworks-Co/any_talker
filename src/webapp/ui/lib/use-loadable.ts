// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

// What each key last loaded (or was set to), for as long as the page lives. A
// screen opened again shows it at once and refreshes it in the background. The
// key names the data rather than the screen: two screens loading the same thing
// share it.
const cache = new Map<string, unknown>();

// What a screen loads, named by `key`: what `load` fetches must change exactly
// when the key does. Declared next to the screen, so anything else that needs
// the same data asks for it by the same name.
export type Loadable<T> = {
  key: string;
  load: () => Promise<T>;
  // The screen copies the data into a form of its own and edits it there,
  // where the cache does not see it. Nothing is kept once the screen is left,
  // so the next open does not start from data its own edits have outdated.
  once?: boolean;
};

type Shown<T> = { key: string; dataKey: string; data: T | null };

// On a key change, the new key's own data if there is any; otherwise the old
// data stays up until the new one arrives, rather than a loader in between.
function shownFor<T>(key: string, prev?: Shown<T>): Shown<T> {
  if (cache.has(key)) return { key, dataKey: key, data: cache.get(key) as T };
  return prev ? { ...prev, key } : { key, dataKey: key, data: null };
}

// The key is the only dependency. Until the data for the current key arrives,
// `data` may still be the previous key's — callers that act on it should carry
// its own parameters in it rather than read them from the current props.
export function useLoadable<T>({ key, load, once }: Loadable<T>): {
  data: T | null;
  setData: Dispatch<SetStateAction<T | null>>;
  error: boolean;
} {
  const [state, setState] = useState<Shown<T>>(() => shownFor(key));
  const [error, setError] = useState(false);
  let shown = state;
  if (state.key !== key) {
    shown = shownFor(key, state);
    setState(shown);
  }
  const dataKey = useRef(shown.dataKey);
  dataKey.current = shown.dataKey;
  // Local changes per key: an answer requested before one is older than it.
  const edits = useRef(new Map<string, number>());

  useEffect(() => {
    let cancelled = false;
    const editsAtStart = edits.current.get(key) ?? 0;
    setError(false);
    load()
      .then((d) => {
        if (cancelled || (edits.current.get(key) ?? 0) !== editsAtStart) return;
        cache.set(key, d);
        setState({ key, dataKey: key, data: d });
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(
    () => (once ? () => void cache.delete(key) : undefined),
    [key, once],
  );

  const setData = useCallback<Dispatch<SetStateAction<T | null>>>((next) => {
    const k = dataKey.current;
    edits.current.set(k, (edits.current.get(k) ?? 0) + 1);
    setState((prev) => {
      const data =
        typeof next === "function"
          ? (next as (p: T | null) => T | null)(prev.data)
          : next;
      if (data === null) cache.delete(prev.dataKey);
      else cache.set(prev.dataKey, data);
      return { ...prev, data };
    });
  }, []);

  return { data: shown.data, setData, error };
}
