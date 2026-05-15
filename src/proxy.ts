// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// Bun's native fetch honours HTTP_PROXY, HTTPS_PROXY, and NO_PROXY at process
// startup (https://bun.com/docs/guides/http/proxy). Everything that calls the
// global fetch — our http.ts utilities, the AI SDK / OpenRouter provider, the
// webapp UI — therefore picks up these env vars for free.
//
// grammY is the one exception: its node-platform shim resolves `fetch` to
// `node-fetch`, which has no idea about HTTP_PROXY. Passing this wrapper as the
// `client.fetch` option in `new Bot(token, { client: { fetch } })` routes the
// Bot API calls through Bun's fetch and gets them the same proxy support.
//
// The wrapper also forwards Bun-specific `proxy` overrides if a caller wants to
// route an individual request through a non-default proxy.
export const proxiedFetch: typeof fetch = ((
  input: RequestInfo | URL,
  init?: RequestInit,
) => fetch(input as Parameters<typeof fetch>[0], init)) as typeof fetch;

// Resolve the proxy URL that Bun's fetch would use for a given target URL, by
// the same rules Bun honours (env vars + exact-host NO_PROXY). Exposed for
// diagnostics — Bun applies this internally so the bot never needs to call it.
export function getEffectiveProxyForUrl(
  url: string,
  env: Record<string, string | undefined> = process.env,
): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

  const noProxy = pickEnv(env.NO_PROXY, env.no_proxy);
  if (noProxy && matchesNoProxy(parsed.hostname, parsed.port, noProxy)) {
    return null;
  }
  if (parsed.protocol === "https:") {
    return pickEnv(env.HTTPS_PROXY, env.https_proxy, env.HTTP_PROXY, env.http_proxy);
  }
  return pickEnv(env.HTTP_PROXY, env.http_proxy);
}

function pickEnv(...candidates: Array<string | undefined>): string | null {
  for (const c of candidates) {
    if (c && c.trim().length > 0) return c.trim();
  }
  return null;
}

function matchesNoProxy(host: string, port: string, raw: string): boolean {
  const hostLower = host.toLowerCase();
  for (const piece of raw.split(",")) {
    const s = piece.trim();
    if (s.length === 0) continue;
    if (s === "*") return true;
    const stripped = s.startsWith(".") ? s.slice(1) : s;
    const colon = stripped.lastIndexOf(":");
    const onlyOneColon =
      colon !== -1 && stripped.indexOf(":") === colon && !stripped.startsWith("[");
    const entryHost = (onlyOneColon ? stripped.slice(0, colon) : stripped).toLowerCase();
    const entryPort = onlyOneColon ? stripped.slice(colon + 1) : null;
    if (entryPort !== null && entryPort !== port) continue;
    if (hostLower === entryHost) return true;
  }
  return false;
}
