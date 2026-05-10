import { z } from "zod";
import type { Tool } from "./registry";

const FIRECRAWL_SEARCH_URL = "https://api.firecrawl.dev/v2/search";
const TIMEOUT_MS = 30_000;
const MAX_RESULTS = 10;

const Schema = z.object({
  query: z.string().max(500).describe("The search query"),
  limit: z.number().int().min(1).max(MAX_RESULTS).default(5).describe("Number of results to return (1–10)"),
});

type Input = z.infer<typeof Schema>;

type FirecrawlResult = {
  title?: string;
  description?: string;
  url?: string;
};

type FirecrawlResponse = {
  success: boolean;
  data?: {
    web?: FirecrawlResult[];
  };
  warning?: string;
};

export function createSearchWebTool(apiKey: string): Tool<Input, string> {
  return {
    name: "search_web",
    description:
      "Search the internet and return a list of relevant results with title, URL, and a short description for each. Use this to find current information, news, documentation, or anything that requires a web search.",
    parameters: Schema,
    execute: async ({ query, limit }, _ctx) => {
      let response: Response;
      try {
        response = await fetch(FIRECRAWL_SEARCH_URL, {
          method: "POST",
          signal: AbortSignal.timeout(TIMEOUT_MS),
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ query, limit }),
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === "TimeoutError") {
          throw new Error(`Search timed out after ${TIMEOUT_MS / 1000}s`);
        }
        throw err;
      }

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`Firecrawl error ${response.status}: ${response.statusText}${body ? ` — ${body}` : ""}`);
      }

      let data: FirecrawlResponse;
      try {
        data = (await response.json()) as FirecrawlResponse;
      } catch {
        throw new Error("Firecrawl returned a non-JSON response");
      }

      if (!data.success) {
        throw new Error("Firecrawl search returned success=false");
      }

      const results = data.data?.web ?? [];
      if (results.length === 0) {
        return "No results found.";
      }

      return results
        .map((r, i) => {
          const lines = [`[${i + 1}] ${r.title ?? "(no title)"}`];
          if (r.url) lines.push(r.url);
          if (r.description) lines.push(r.description);
          return lines.join("\n");
        })
        .join("\n\n");
    },
  };
}
