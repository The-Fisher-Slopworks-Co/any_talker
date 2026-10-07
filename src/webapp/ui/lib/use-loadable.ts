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
// When each key's data last came from the server.
const loadedAt = new Map<string, number>();
// The request out for each key: whoever asks meanwhile waits for it rather than
// sending another.
const inFlight = new Map<string, Promise<void>>();
// Local changes per key: an answer requested before one is older than it.
const edits = new Map<string, number>();

// Data loaded this recently is what a screen opened right after its preload
// would fetch again: it is shown as it is, without asking a second time.
const FRESH_MS = 2000;

// What a screen loads, named by `key`: what `load` fetches must change exactly
// when the key does. Declared next to the screen, so anything else that needs
// the same data asks for it by the same name.
export type Loadable<T> = {
  key: string;
  load: () => Promise<T>;
  // The screen copies the data into a form of its own and edits it there,
  // where the cache does not see it. Nothing is kept once the screen is left,
  // so the next open does not start from data its own edits have outdated,
  // and only a just-loaded copy is shown.
  once?: boolean;
};

const fresh = (key: string) =>
  cache.has(key) && Date.now() - (loadedAt.get(key) ?? -Infinity) < FRESH_MS;

// Whether the cache can show the data at once.
const usable = (key: string, once = false) =>
  once ? fresh(key) : cache.has(key);

const edited = (key: string) => edits.set(key, (edits.get(key) ?? 0) + 1);

// Loads `l` into the cache, or joins the request already out for it. An answer
// a local change has overtaken is dropped.
function fetchShared({ key, load }: Loadable<unknown>): Promise<void> {
  let request = inFlight.get(key);
  if (!request) {
    const editsAtStart = edits.get(key) ?? 0;
    request = load()
      .then((d) => {
        if ((edits.get(key) ?? 0) !== editsAtStart) return;
        cache.set(key, d);
        loadedAt.set(key, Date.now());
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, request);
  }
  return request;
}

// Starts loading `l` ahead of its screen, unless it was just loaded. Settles
// once the screen could show it whole: at once if the cache already can, or
// else when the request does, whether it succeeded or not.
export function preload(l: Loadable<unknown>): Promise<void> {
  const loading = fresh(l.key) ? Promise.resolve() : fetchShared(l);
  return usable(l.key, l.once) ? Promise.resolve() : loading.catch(() => {});
}

type Shown<T> = { key: string; dataKey: string; data: T | null };

// On a key change, the new key's own data if there is any; otherwise the old
// data stays up until the new one arrives, rather than a loader in between.
function shownFor<T>(key: string, once = false, prev?: Shown<T>): Shown<T> {
  if (usable(key, once))
    return { key, dataKey: key, data: cache.get(key) as T };
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
  const [state, setState] = useState<Shown<T>>(() => shownFor(key, once));
  const [error, setError] = useState(false);
  let shown = state;
  if (state.key !== key) {
    shown = shownFor(key, once, state);
    setState(shown);
  }
  const dataKey = useRef(shown.dataKey);
  dataKey.current = shown.dataKey;

  useEffect(() => {
    let cancelled = false;
    // Also picks up a load that landed between the render and this effect.
    const show = () => {
      const data = cache.get(key) as T;
      if (!cancelled && cache.has(key))
        setState((s) =>
          s.dataKey === key && s.data === data
            ? s
            : { key, dataKey: key, data },
        );
    };
    setError(false);
    if (fresh(key)) show();
    else
      fetchShared({ key, load }).then(show, () => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!once) return;
    return () => {
      // A request still out for it would land data older than the edits.
      edited(key);
      cache.delete(key);
    };
  }, [key, once]);

  const setData = useCallback<Dispatch<SetStateAction<T | null>>>((next) => {
    edited(dataKey.current);
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
