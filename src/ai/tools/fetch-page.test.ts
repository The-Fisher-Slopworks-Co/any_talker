import { test, expect, describe, mock, beforeEach, afterEach } from "bun:test";
import { fetchPageTool } from "./fetch-page";
import type { ToolCallContext } from "./registry";

const ctx: ToolCallContext = {
  source: "ask",
  chatId: "c",
  userId: "u",
  replyToMessageId: null,
  timezone: "UTC",
  now: 0,
};

const mockFetch = mock(() => Promise.resolve(new Response("", { status: 200 })));
const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = mockFetch as unknown as typeof fetch;
  mockFetch.mockReset();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
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
    ])("blocks private/local URL: %s", async (url) => {
      await expect(fetchPageTool.execute({ url }, ctx)).rejects.toThrow("Blocked");
      expect(mockFetch).not.toHaveBeenCalled();
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

    test("throws when content-length exceeds limit", async () => {
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
