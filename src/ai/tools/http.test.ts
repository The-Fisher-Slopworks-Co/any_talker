// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe, mock, beforeEach, afterEach } from "bun:test";
import { resolvePublicHost, safeFetch } from "./http";

type DnsAnswer = { address: string; family: 4 | 6; ttl: number };

const originalDnsLookup = Bun.dns.lookup;
const originalFetch = globalThis.fetch;

function mockDns(answers: DnsAnswer[] | ((host: string) => DnsAnswer[])) {
  (Bun.dns as { lookup: typeof Bun.dns.lookup }).lookup = (async (host: string) => {
    const out = typeof answers === "function" ? answers(host) : answers;
    return out;
  }) as typeof Bun.dns.lookup;
}

const fetchSpy = mock(
  (_input: string | URL | Request, _init?: BunFetchRequestInit) =>
    Promise.resolve(new Response("ok", { status: 200 })),
);

beforeEach(() => {
  globalThis.fetch = fetchSpy as unknown as typeof fetch;
  fetchSpy.mockReset();
  fetchSpy.mockImplementation(() => Promise.resolve(new Response("ok", { status: 200 })));
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  (Bun.dns as { lookup: typeof Bun.dns.lookup }).lookup = originalDnsLookup;
});

describe("resolvePublicHost", () => {
  test("returns the IP itself for a public IP literal", async () => {
    expect(await resolvePublicHost("8.8.8.8")).toBe("8.8.8.8");
  });

  test("throws for a private IP literal", async () => {
    await expect(resolvePublicHost("10.0.0.1")).rejects.toThrow("Blocked");
  });

  test("returns the first public IP when all DNS answers are public", async () => {
    mockDns([
      { address: "203.0.113.10", family: 4, ttl: 60 },
      { address: "198.51.100.7", family: 4, ttl: 60 },
    ]);
    expect(await resolvePublicHost("example.test")).toBe("203.0.113.10");
  });

  test("rejects when any DNS answer is private (rebinding-style mix)", async () => {
    // A malicious authoritative server can return one public address and one
    // private address. The defence MUST reject the whole lookup, otherwise a
    // second resolution inside the HTTP client could pick the private one.
    mockDns([
      { address: "203.0.113.10", family: 4, ttl: 60 },
      { address: "127.0.0.1", family: 4, ttl: 60 },
    ]);
    await expect(resolvePublicHost("rebind.test")).rejects.toThrow("Blocked");
  });

  test("rejects on empty DNS answer", async () => {
    mockDns([]);
    await expect(resolvePublicHost("nx.test")).rejects.toThrow("Blocked");
  });

  test("rejects 'localhost' without a DNS lookup", async () => {
    mockDns(() => {
      throw new Error("should not be called");
    });
    await expect(resolvePublicHost("localhost")).rejects.toThrow("Blocked");
  });
});

describe("safeFetch DNS pinning", () => {
  test("pins the upstream URL to the resolved IP literal", async () => {
    mockDns([{ address: "203.0.113.10", family: 4, ttl: 60 }]);

    await safeFetch("http://example.test/page", {
      init: {},
      timeoutMs: 1_000,
      timeoutLabel: "test",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [calledUrl] = fetchSpy.mock.calls[0]!;
    expect(calledUrl).toBe("http://203.0.113.10/page");
  });

  test("sets the Host header to the original hostname so virtual-hosted servers route correctly", async () => {
    mockDns([{ address: "203.0.113.10", family: 4, ttl: 60 }]);

    await safeFetch("http://example.test/page", {
      init: {},
      timeoutMs: 1_000,
      timeoutLabel: "test",
    });

    const [, init] = fetchSpy.mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(headers.get("host")).toBe("example.test");
  });

  test("sets tls.serverName + checkServerIdentity to the original hostname for HTTPS", async () => {
    mockDns([{ address: "203.0.113.10", family: 4, ttl: 60 }]);

    await safeFetch("https://example.test/page", {
      init: {},
      timeoutMs: 1_000,
      timeoutLabel: "test",
    });

    const [calledUrl, init] = fetchSpy.mock.calls[0]!;
    expect(calledUrl).toBe("https://203.0.113.10/page");
    const bunInit = init as BunFetchRequestInit;
    expect(bunInit.tls?.serverName).toBe("example.test");
    expect(typeof bunInit.tls?.checkServerIdentity).toBe("function");
    // The override must validate against the original hostname — not the IP —
    // otherwise rebinding to a private IP at TLS time would still slip past.
    const wrongCert = { subject: { CN: "attacker.invalid" }, subjectaltname: "DNS:attacker.invalid" };
    const err = bunInit.tls!.checkServerIdentity!("203.0.113.10", wrongCert as never);
    expect(err).toBeInstanceOf(Error);
    expect(err!.message).toContain("example.test");
  });

  test("does not set tls.serverName for HTTP", async () => {
    mockDns([{ address: "203.0.113.10", family: 4, ttl: 60 }]);

    await safeFetch("http://example.test/page", {
      init: {},
      timeoutMs: 1_000,
      timeoutLabel: "test",
    });

    const [, init] = fetchSpy.mock.calls[0]!;
    expect((init as BunFetchRequestInit).tls).toBeUndefined();
  });

  test("preserves user-supplied headers and merges Host on top", async () => {
    mockDns([{ address: "203.0.113.10", family: 4, ttl: 60 }]);

    await safeFetch("https://example.test/page", {
      init: { headers: { "User-Agent": "ua-test", "X-Custom": "v" } },
      timeoutMs: 1_000,
      timeoutLabel: "test",
    });

    const [, init] = fetchSpy.mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(headers.get("user-agent")).toBe("ua-test");
    expect(headers.get("x-custom")).toBe("v");
    expect(headers.get("host")).toBe("example.test");
  });

  test("does not rewrite URL or set host header when the URL already uses a public IP literal", async () => {
    await safeFetch("http://203.0.113.10/page", {
      init: {},
      timeoutMs: 1_000,
      timeoutLabel: "test",
    });

    const [calledUrl, init] = fetchSpy.mock.calls[0]!;
    expect(calledUrl).toBe("http://203.0.113.10/page");
    const headers = new Headers(init?.headers);
    expect(headers.get("host")).toBeNull();
  });

  test("brackets IPv6 addresses when writing them back into the URL", async () => {
    mockDns([{ address: "2001:db8::1", family: 6, ttl: 60 }]);

    await safeFetch("https://example.test/page", {
      init: {},
      timeoutMs: 1_000,
      timeoutLabel: "test",
    });

    const [calledUrl] = fetchSpy.mock.calls[0]!;
    expect(calledUrl).toBe("https://[2001:db8::1]/page");
  });

  test("rebinding mix (public + private answers) blocks the request before fetch is called", async () => {
    mockDns([
      { address: "203.0.113.10", family: 4, ttl: 60 },
      { address: "169.254.169.254", family: 4, ttl: 60 },
    ]);

    await expect(
      safeFetch("https://rebind.test/aws-metadata", {
        init: {},
        timeoutMs: 1_000,
        timeoutLabel: "test",
      }),
    ).rejects.toThrow("Blocked");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("preserves the path, query, and explicit standard port through the IP rewrite", async () => {
    mockDns([{ address: "203.0.113.10", family: 4, ttl: 60 }]);

    await safeFetch("https://example.test:443/path/x?y=1#frag", {
      init: {},
      timeoutMs: 1_000,
      timeoutLabel: "test",
    });

    const [calledUrl] = fetchSpy.mock.calls[0]!;
    // URL normalises away :443 for https; what matters is path/query survive.
    expect(calledUrl).toBe("https://203.0.113.10/path/x?y=1#frag");
  });
});
