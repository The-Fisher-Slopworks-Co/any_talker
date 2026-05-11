import { test, expect, describe, mock, beforeEach, afterEach } from "bun:test";
import { createSearchWebTool } from "./search-web";
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

describe("search_web tool", () => {
  test("returns formatted results on success", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              web: [
                { title: "First", url: "https://a.example/1", description: "desc 1" },
                { title: "Second", url: "https://b.example/2", description: "desc 2" },
              ],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    const tool = createSearchWebTool("key", 2);
    const result = await tool.execute({ query: "hello", limit: 5 }, ctx);
    expect(result).toContain("First");
    expect(result).toContain("https://a.example/1");
    expect(result).toContain("Second");
  });

  test("returns 'No results found.' when web is empty", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ success: true, data: { web: [] } }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    const tool = createSearchWebTool("key", 2);
    const result = await tool.execute({ query: "x", limit: 5 }, ctx);
    expect(result).toBe("No results found.");
  });

  test("throws when streamed body exceeds 1MB cap (no content-length)", async () => {
    const big = new Uint8Array(1_000_002);
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
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const tool = createSearchWebTool("key", 2);
    await expect(tool.execute({ query: "x", limit: 5 }, ctx)).rejects.toThrow("Response too large");
  });

  test("throws on non-JSON body", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        new Response("not json", {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
      ),
    );
    const tool = createSearchWebTool("key", 2);
    await expect(tool.execute({ query: "x", limit: 5 }, ctx)).rejects.toThrow("non-JSON");
  });

  test("propagates Firecrawl HTTP errors", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(new Response("rate limited", { status: 429, statusText: "Too Many Requests" })),
    );
    const tool = createSearchWebTool("key", 2);
    await expect(tool.execute({ query: "x", limit: 5 }, ctx)).rejects.toThrow("Firecrawl error 429");
  });
});
