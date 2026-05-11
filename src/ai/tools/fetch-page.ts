// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { z } from "zod";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";
import { readTextCapped, safeFetch } from "./http";
import type { Tool } from "./registry";

const MAX_LENGTH = 50_000;
const MAX_BODY_BYTES = 10_000_000;
const TIMEOUT_MS = 15_000;

const Schema = z.object({
  url: z.string().url(),
});

type Input = z.infer<typeof Schema>;

const td = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });

export const fetchPageTool: Tool<Input, string> = {
  name: "fetch_page",
  description:
    "Fetch a public web page by URL and return its content as Markdown. Uses Readability to extract the main article body where possible; falls back to converting the full HTML page otherwise.",
  parameters: Schema,
  execute: async ({ url }, _ctx) => {
    const response = await safeFetch(url, {
      init: {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; AnyTalkerBot/1.0)",
          Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        },
      },
      timeoutMs: TIMEOUT_MS,
      timeoutLabel: `Fetching ${url}`,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    const body = await readTextCapped(response, MAX_BODY_BYTES);

    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return body.slice(0, MAX_LENGTH);
    }

    const window = parseHTML(body);

    let article: ReturnType<Readability["parse"]> | null = null;
    try {
      article = new Readability(window.document as unknown as Document).parse();
    } catch {
      // Readability can throw on malformed DOMs; fall through to turndown
    }

    if (article?.content) {
      const md = td.turndown(article.content);
      const parts: string[] = [];
      if (article.title) parts.push(`# ${article.title}`);
      if (article.byline) parts.push(`*${article.byline}*`);
      parts.push(md);
      return parts.join("\n\n").slice(0, MAX_LENGTH);
    }

    return td.turndown(body).slice(0, MAX_LENGTH);
  },
};
