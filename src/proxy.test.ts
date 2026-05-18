// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe, mock, beforeEach, afterEach } from "bun:test";
import { proxiedFetch, getEffectiveProxyForUrl } from "./proxy";

describe("getEffectiveProxyForUrl", () => {
  test("https URL uses HTTPS_PROXY", () => {
    expect(
      getEffectiveProxyForUrl("https://x.com", {
        HTTPS_PROXY: "http://hsp:443",
      }),
    ).toBe("http://hsp:443");
  });

  test("http URL uses HTTP_PROXY", () => {
    expect(
      getEffectiveProxyForUrl("http://x.com", {
        HTTP_PROXY: "http://hp:80",
      }),
    ).toBe("http://hp:80");
  });

  test("https falls back to HTTP_PROXY when HTTPS_PROXY missing", () => {
    expect(
      getEffectiveProxyForUrl("https://x.com", {
        HTTP_PROXY: "http://hp:80",
      }),
    ).toBe("http://hp:80");
  });

  test("NO_PROXY exact host suppresses proxy", () => {
    expect(
      getEffectiveProxyForUrl("https://internal", {
        HTTPS_PROXY: "http://hsp:443",
        NO_PROXY: "internal",
      }),
    ).toBeNull();
  });

  test("NO_PROXY comma list", () => {
    const env = {
      HTTP_PROXY: "http://hp:80",
      NO_PROXY: "foo, internal , bar.com",
    };
    expect(getEffectiveProxyForUrl("http://internal/x", env)).toBeNull();
    expect(getEffectiveProxyForUrl("http://other/x", env)).toBe("http://hp:80");
  });

  test("NO_PROXY wildcard disables proxy entirely", () => {
    expect(
      getEffectiveProxyForUrl("https://anything.tld", {
        HTTPS_PROXY: "http://hsp:443",
        NO_PROXY: "*",
      }),
    ).toBeNull();
  });

  test("NO_PROXY with per-entry port only matches that port", () => {
    const env = {
      HTTPS_PROXY: "http://hsp:443",
      NO_PROXY: "example.com:8443",
    };
    expect(getEffectiveProxyForUrl("https://example.com:8443/", env)).toBeNull();
    expect(getEffectiveProxyForUrl("https://example.com/", env)).toBe(
      "http://hsp:443",
    );
  });

  test("accepts lowercase env vars", () => {
    expect(
      getEffectiveProxyForUrl("https://x.com", {
        https_proxy: "http://hsp:443",
        no_proxy: "x.com",
      }),
    ).toBeNull();
    expect(
      getEffectiveProxyForUrl("https://other.com", {
        https_proxy: "http://hsp:443",
      }),
    ).toBe("http://hsp:443");
  });

  test("prefers uppercase over lowercase", () => {
    expect(
      getEffectiveProxyForUrl("https://x.com", {
        HTTPS_PROXY: "http://upper",
        https_proxy: "http://lower",
      }),
    ).toBe("http://upper");
  });

  test("returns null for unsupported protocols", () => {
    expect(
      getEffectiveProxyForUrl("ftp://x.com", { HTTP_PROXY: "http://hp" }),
    ).toBeNull();
  });

  test("returns null for invalid URLs", () => {
    expect(
      getEffectiveProxyForUrl("not-a-url", { HTTP_PROXY: "http://hp" }),
    ).toBeNull();
  });

  test("returns null when no proxy configured", () => {
    expect(getEffectiveProxyForUrl("https://x.com", {})).toBeNull();
  });
});

describe("proxiedFetch", () => {
  const originalFetch = globalThis.fetch;
  const mockFetch = mock(() => Promise.resolve(new Response("", { status: 200 })));

  beforeEach(() => {
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    mockFetch.mockReset();
    mockFetch.mockImplementation(() =>
      Promise.resolve(new Response("", { status: 200 })),
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("forwards the call to the underlying fetch", async () => {
    await proxiedFetch("https://example.com/foo", { method: "POST" });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0]! as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://example.com/foo");
    expect(init.method).toBe("POST");
  });

  test("accepts URL and Request inputs", async () => {
    await proxiedFetch(new URL("https://example.com/a"));
    await proxiedFetch(new Request("https://example.com/b"));
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  test("passes through a Bun proxy override in init", async () => {
    await proxiedFetch("https://x.com", {
      // Bun-specific option; not part of stdlib RequestInit.
      ...({ proxy: "http://override:1" } as RequestInit),
    });
    const [, init] = mockFetch.mock.calls[0]! as unknown as [
      string,
      RequestInit & { proxy?: string },
    ];
    expect(init.proxy).toBe("http://override:1");
  });
});
