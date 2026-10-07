// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

/// <reference lib="dom" />
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

// Where the user is in the Web App (the screen, the picked filter or scope)
// survives a page reload through sessionStorage. It is per-tab and cleared
// when the Mini App is closed, so a fresh open still starts on the home screen.
const PREFIX = "any-talker:";

type KeyValueStore = Pick<Storage, "getItem" | "setItem">;

function sessionStore(): KeyValueStore | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

// `parse` rejects anything stale or malformed (an older build's shape, a
// hand-edited value) by returning null, and the caller's default wins.
export function readSessionValue<T>(
  store: KeyValueStore | null,
  key: string,
  parse: (raw: unknown) => T | null,
): T | null {
  try {
    const raw = store?.getItem(PREFIX + key);
    return raw == null ? null : parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeSessionValue(
  store: KeyValueStore | null,
  key: string,
  value: unknown,
): void {
  try {
    store?.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage full or disabled: the state just won't survive a reload.
  }
}

// What `useSessionState(key)` starts from, for code outside the screen that
// owns it.
export function readSession<T>(
  key: string,
  parse: (raw: unknown) => T | null,
): T | null {
  return readSessionValue(sessionStore(), key, parse);
}

export function useSessionState<T>(
  key: string,
  initial: T,
  parse: (raw: unknown) => T | null,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(
    () => readSessionValue(sessionStore(), key, parse) ?? initial,
  );
  useEffect(() => {
    writeSessionValue(sessionStore(), key, value);
  }, [key, value]);
  return [value, setValue];
}

export function parseString(raw: unknown): string | null {
  return typeof raw === "string" ? raw : null;
}
