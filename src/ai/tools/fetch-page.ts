import { z } from "zod";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";
import type { Tool } from "./registry";

const PRIVATE_HOST =
  /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|169\.254\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|::1|fe80:|fc[0-9a-f]{2}:|fd[0-9a-f]{2}:|::ffff:(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)\d+\.\d+)/i;

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
    const { hostname } = new URL(url);
    if (PRIVATE_HOST.test(hostname)) {
      throw new Error("Blocked: private and local addresses are not allowed");
    }

    let response: Response;
    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; AnyTalkerBot/1.0)",
          Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        },
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "TimeoutError") {
        throw new Error(`Timed out after ${TIMEOUT_MS / 1000}s fetching ${url}`);
      }
      throw err;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const bodyLength = Number(response.headers.get("content-length") ?? 0);
    if (bodyLength > MAX_BODY_BYTES) {
      throw new Error(`Response too large (${bodyLength} bytes)`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return (await response.text()).slice(0, MAX_LENGTH);
    }

    const html = await response.text();
    const window = parseHTML(html);

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

    return td.turndown(html).slice(0, MAX_LENGTH);
  },
};
