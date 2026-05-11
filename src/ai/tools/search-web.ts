// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { z } from "zod";
import { fetchWithTimeout, readTextCapped } from "./http";
import type { Tool } from "./registry";

const FIRECRAWL_SEARCH_URL = "https://api.firecrawl.dev/v2/search";
const TIMEOUT_MS = 30_000;
const MAX_RESULTS = 10;
const MAX_BODY_BYTES = 1_000_000;
const QUEUE_MULTIPLIER = 4;

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
};

export function createSemaphore(limit: number, maxQueueDepth: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  return async function acquire<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= limit) {
      if (queue.length >= maxQueueDepth) {
        throw new Error(`Search queue full (${queue.length} waiting, max ${maxQueueDepth})`);
      }
      await new Promise<void>((resolve) => queue.push(resolve));
      // Permit transferred from the releaser; do not bump `active` here —
      // otherwise a concurrent acquire that arrives between the releaser's
      // dequeue and our resume could grab the same slot.
    } else {
      active++;
    }
    try {
      return await fn();
    } finally {
      const next = queue.shift();
      if (next) {
        next();
      } else {
        active--;
      }
    }
  };
}

export function createSearchWebTool(apiKey: string, concurrency: number): Tool<Input, string> {
  const sem = createSemaphore(concurrency, concurrency * QUEUE_MULTIPLIER);
  return {
    name: "search_web",
    description:
      "Search the internet and return a list of relevant results with title, URL, and a short description for each. Use this to find current information, news, documentation, or anything that requires a web search.",
    parameters: Schema,
    execute: ({ query, limit }, _ctx) =>
      sem(async () => {
        const response = await fetchWithTimeout(
          FIRECRAWL_SEARCH_URL,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({ query, limit }),
          },
          TIMEOUT_MS,
          "Search",
        );

        if (!response.ok) {
          const body = await readTextCapped(response, MAX_BODY_BYTES).catch(() => "");
          throw new Error(`Firecrawl error ${response.status}: ${response.statusText}${body ? ` — ${body}` : ""}`);
        }

        let body: string;
        try {
          body = await readTextCapped(response, MAX_BODY_BYTES);
        } catch (err) {
          if (err instanceof DOMException && err.name === "TimeoutError") {
            throw new Error(`Search timed out after ${TIMEOUT_MS / 1000}s`);
          }
          throw err;
        }

        let data: FirecrawlResponse;
        try {
          data = JSON.parse(body) as FirecrawlResponse;
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
      }),
  };
}
