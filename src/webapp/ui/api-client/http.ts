// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

/// <reference lib="dom" />

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        initDataUnsafe?: {
          user?: {
            first_name?: string;
            last_name?: string;
            username?: string;
            language_code?: string;
          };
        };
        ready: () => void;
        expand: () => void;
        openTelegramLink?: (url: string) => void;
        openLink?: (url: string) => void;
        BackButton?: {
          show: () => void;
          hide: () => void;
          onClick: (cb: () => void) => void;
          offClick: (cb: () => void) => void;
        };
      };
    };
  }
}

function authHeader(): Record<string, string> {
  const initData = window.Telegram?.WebApp?.initData ?? "";
  return { Authorization: `tma ${initData}` };
}

// The single authenticated round trip every domain client goes through: the
// Telegram initData bearer, JSON in and out, and a failure raised as an Error
// carrying the API's error code and the HTTP status.
export async function req<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { ...authHeader(), "Content-Type": "application/json" },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  if (!res.ok) {
    let errorCode: string | null = null;
    try {
      const data = (await res.json()) as { error?: unknown };
      if (typeof data.error === "string") errorCode = data.error;
    } catch {
      // ignore
    }
    const err = new Error(
      errorCode
        ? `${method} ${path}: ${res.status} ${errorCode}`
        : `${method} ${path}: ${res.status}`,
    ) as Error & { code: string | null; status: number };
    err.code = errorCode;
    err.status = res.status;
    throw err;
  }
  return (await res.json()) as T;
}
