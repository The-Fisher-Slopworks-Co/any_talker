// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe, mock, beforeEach, afterEach } from "bun:test";
import { fetchPageTool } from "./fetch-page";
import type { ToolCallContext } from "./registry";

const ctx: ToolCallContext = {
  source: "ask",
  chatId: "c",
  userId: "u",
  replyToMessageId: null,
  timezone: "UTC",
  lang: "en",
  now: 0,
};

const mockFetch = mock(() => Promise.resolve(new Response("", { status: 200 })));
const originalFetch = globalThis.fetch;
const originalDnsLookup = Bun.dns.lookup;

beforeEach(() => {
  globalThis.fetch = mockFetch as unknown as typeof fetch;
  mockFetch.mockReset();
  // Stub Bun.dns.lookup so safeFetch's IP-pinning resolves to a deterministic
  // public address without hitting real DNS in tests.
  (Bun.dns as { lookup: typeof Bun.dns.lookup }).lookup = (async () =>
    [{ address: "203.0.113.10", family: 4, ttl: 60 }]) as typeof Bun.dns.lookup;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  (Bun.dns as { lookup: typeof Bun.dns.lookup }).lookup = originalDnsLookup;
});

function htmlResponse(html: string, contentType = "text/html; charset=utf-8") {
  return new Response(html, {
    status: 200,
    headers: { "content-type": contentType },
  });
}

describe("fetch_page tool", () => {
  describe("schema validation", () => {
    test("accepts a valid URL", () => {
      expect(fetchPageTool.parameters.safeParse({ url: "https://example.com" }).success).toBe(true);
    });

    test("rejects a non-URL string", () => {
      expect(fetchPageTool.parameters.safeParse({ url: "not-a-url" }).success).toBe(false);
    });

    test("rejects missing url", () => {
      expect(fetchPageTool.parameters.safeParse({}).success).toBe(false);
    });
  });

  describe("SSRF protection", () => {
    test.each([
      "http://localhost/secret",
      "http://127.0.0.1/secret",
      "http://192.168.1.1/router",
      "http://10.0.0.1/internal",
      "http://172.16.0.1/internal",
      "http://0.0.0.0/",
      "http://169.254.169.254/latest/meta-data/",
    ])("blocks IPv4 private/local URL: %s", async (url) => {
      await expect(fetchPageTool.execute({ url }, ctx)).rejects.toThrow("Blocked");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test.each([
      "http://[::1]/",
      "http://[fc00::1]/",
      "http://[fd12:3456:789a::1]/",
      "http://[fe80::1]/",
      "http://[::ffff:127.0.0.1]/",
    ])("blocks IPv6 private/local URL: %s", async (url) => {
      await expect(fetchPageTool.execute({ url }, ctx)).rejects.toThrow("Blocked");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test("rejects non-http(s) protocols", async () => {
      await expect(
        fetchPageTool.execute({ url: "file:///etc/passwd" }, ctx),
      ).rejects.toThrow();
    });

    test.each([
      "http://example.com:22/",
      "http://example.com:8080/",
      "https://example.com:8443/",
      "http://example.com:6379/",
    ])("blocks non-standard destination port: %s", async (url) => {
      await expect(fetchPageTool.execute({ url }, ctx)).rejects.toThrow(
        "port",
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test("blocks redirect to a non-standard port on a public host", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(null, {
            status: 302,
            headers: { location: "http://example.org:8080/internal" },
          }),
        ),
      );
      await expect(
        fetchPageTool.execute({ url: "https://example.com/redir" }, ctx),
      ).rejects.toThrow("port");
    });

    test("allows explicit standard ports (:80 on http, :443 on https)", async () => {
      mockFetch.mockImplementation(() => Promise.resolve(htmlResponse("<p>ok</p>")));
      await expect(
        fetchPageTool.execute({ url: "http://example.com:80/" }, ctx),
      ).resolves.toBeDefined();
      await expect(
        fetchPageTool.execute({ url: "https://example.com:443/" }, ctx),
      ).resolves.toBeDefined();
    });

    test("blocks redirect to a private address", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(null, {
            status: 302,
            headers: { location: "http://127.0.0.1/admin" },
          }),
        ),
      );
      await expect(
        fetchPageTool.execute({ url: "https://example.com/redir" }, ctx),
      ).rejects.toThrow("Blocked");
    });

    test("blocks redirect to an IPv6 loopback", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(null, {
            status: 301,
            headers: { location: "http://[::1]/" },
          }),
        ),
      );
      await expect(
        fetchPageTool.execute({ url: "https://example.com/redir" }, ctx),
      ).rejects.toThrow("Blocked");
    });

    test("follows redirects to public hosts", async () => {
      let call = 0;
      mockFetch.mockImplementation(() => {
        call++;
        if (call === 1) {
          return Promise.resolve(
            new Response(null, {
              status: 302,
              headers: { location: "https://example.org/final" },
            }),
          );
        }
        return Promise.resolve(htmlResponse("<html><body><p>landed</p></body></html>"));
      });
      const result = await fetchPageTool.execute({ url: "https://example.com/start" }, ctx);
      expect(result.length).toBeGreaterThan(0);
      expect(call).toBe(2);
    });

    test("rejects after exceeding redirect limit", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(null, {
            status: 302,
            headers: { location: "https://example.org/loop" },
          }),
        ),
      );
      await expect(
        fetchPageTool.execute({ url: "https://example.com/loop" }, ctx),
      ).rejects.toThrow("Too many redirects");
    });
  });

  describe("HTTP errors", () => {
    test("throws on non-OK response", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(new Response("Not Found", { status: 404, statusText: "Not Found" }))
      );
      await expect(fetchPageTool.execute({ url: "https://example.com/404" }, ctx)).rejects.toThrow(
        "HTTP 404"
      );
    });

    test("throws when declared content-length exceeds limit", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response("body", {
            status: 200,
            headers: { "content-type": "text/plain", "content-length": "10000001" },
          })
        )
      );
      await expect(fetchPageTool.execute({ url: "https://example.com/huge" }, ctx)).rejects.toThrow(
        "Response too large"
      );
    });

    test("throws when streamed body exceeds limit (no content-length)", async () => {
      const big = new Uint8Array(10_000_002);
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(big);
          controller.close();
        },
      });
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(stream, {
            status: 200,
            headers: { "content-type": "text/html" },
          }),
        ),
      );
      await expect(
        fetchPageTool.execute({ url: "https://example.com/chunked" }, ctx),
      ).rejects.toThrow("Response too large");
    });
  });

  describe("content type handling", () => {
    test("returns plain text for non-HTML content types", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response("plain text content", {
            status: 200,
            headers: { "content-type": "text/plain" },
          })
        )
      );
      const result = await fetchPageTool.execute({ url: "https://example.com/file.txt" }, ctx);
      expect(result).toBe("plain text content");
    });
  });

  describe("HTML to Markdown conversion", () => {
    test("converts an article page via Readability", async () => {
      const html = `<!DOCTYPE html><html><head><title>My Article</title></head><body>
        <article>
          <h1>My Article</h1>
          <p>This is a long paragraph that provides sufficient content for Readability to extract. It needs to be long enough to meet the minimum content threshold. Adding more words here to ensure extraction works properly in the test environment.</p>
          <p>Another paragraph with more content to make sure we have enough material for the Readability algorithm to work with during testing.</p>
        </article>
      </body></html>`;
      mockFetch.mockImplementation(() => Promise.resolve(htmlResponse(html)));
      const result = await fetchPageTool.execute({ url: "https://example.com/article" }, ctx);
      expect(result).toContain("My Article");
      expect(result).toContain("paragraph");
    });

    test("falls back to full HTML conversion for non-article pages", async () => {
      const html = `<!DOCTYPE html><html><head><title>Dashboard</title></head><body>
        <nav><a href="/">Home</a></nav>
        <div class="widget">Widget A</div>
        <div class="widget">Widget B</div>
      </body></html>`;
      mockFetch.mockImplementation(() => Promise.resolve(htmlResponse(html)));
      const result = await fetchPageTool.execute({ url: "https://example.com/dashboard" }, ctx);
      expect(result.length).toBeGreaterThan(0);
    });

    test("truncates output to 50 000 characters", async () => {
      const longContent = "word ".repeat(20_000);
      const html = `<!DOCTYPE html><html><body><p>${longContent}</p></body></html>`;
      mockFetch.mockImplementation(() => Promise.resolve(htmlResponse(html)));
      const result = await fetchPageTool.execute({ url: "https://example.com/long" }, ctx);
      expect(result.length).toBeLessThanOrEqual(50_000);
    });
  });
});
