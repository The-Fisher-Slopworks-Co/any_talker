// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { z } from "zod";
import { fetchWithTimeout, readTextCapped } from "./http";
import type { Tool } from "./registry";

const MAX_LENGTH = 50_000;
const MAX_BODY_BYTES = 15_000_000;

// YouTube serves a "confirm you're not a bot" wall to datacenter IPs, and its
// timedtext caption endpoint now returns an empty body without a BotGuard "pot"
// token. Both are sidestepped by scraping through Firecrawl: its YouTube
// handling embeds the transcript directly in the page's markdown output, so we
// never touch timedtext at all.
const FIRECRAWL_SCRAPE_URL = "https://api.firecrawl.dev/v2/scrape";
const FIRECRAWL_TIMEOUT_MS = 90_000;

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
// Covers watch?v=, youtu.be/, m.youtube.com/watch?v=, shorts/, embed/, v/.
// The pre-`v=` group is lazy (`(?:.*?&)??`) so matching prefers skipping it —
// picking the FIRST v= param (as YouTube does), not the last. The trailing
// `(?![A-Za-z0-9_-])` rejects 12+ char runs rather than silently truncating
// them to the first 11 characters.
const URL_VIDEO_ID_RE =
  /(?:youtube\.com\/(?:watch\?(?:.*?&)??v=|shorts\/|embed\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/;

const Schema = z.object({
  url: z.string().min(1).describe(
    "YouTube video URL (watch, youtu.be, m., shorts) or a bare 11-character video ID.",
  ),
  language: z
    .string()
    .min(2)
    .max(10)
    .optional()
    .describe(
      "Optional ISO language code (e.g. 'en', 'ru'). Omit (recommended) to get the transcript in the video's original language, which is auto-detected. If set to a language the video isn't in, the result is a machine translation whose quality and even target language can be unreliable.",
    ),
});

type Input = z.infer<typeof Schema>;

export function extractVideoId(input: string): string {
  const trimmed = input.trim();
  if (VIDEO_ID_RE.test(trimmed)) return trimmed;
  const match = URL_VIDEO_ID_RE.exec(trimmed);
  if (match && match[1]) return match[1];
  throw new Error(`Could not extract a YouTube video ID from: ${input}`);
}

type CaptionTrack = {
  languageCode?: string;
  kind?: string;
};

type PlayerResponse = {
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: CaptionTrack[];
    };
  };
  playabilityStatus?: { status?: string; reason?: string };
};

// Extract ytInitialPlayerResponse JSON from a watch page. YouTube embeds it as
// `var ytInitialPlayerResponse = { ... };` (the trailing `;` may be followed by
// other JS). We scan brace-by-brace from the opening `{` to find the matching
// `}` while respecting string literals and escapes.
export function extractPlayerResponseJson(html: string): string {
  // Anchor on the assignment form so an earlier mention in a string literal,
  // comment, or ytcfg reference doesn't make us walk the wrong object.
  const assignment = /ytInitialPlayerResponse\s*=\s*\{/.exec(html);
  if (!assignment) {
    throw new Error("Could not find ytInitialPlayerResponse on the page");
  }
  const braceStart = assignment.index + assignment[0].length - 1;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = braceStart; i < html.length; i++) {
    const ch = html[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return html.slice(braceStart, i + 1);
      }
    }
  }
  throw new Error("Unbalanced braces in ytInitialPlayerResponse JSON");
}

// The original spoken language of a video. YouTube's auto-generated (asr) track
// is transcribed from the audio, so its languageCode is the spoken language;
// fall back to the first listed track otherwise.
export function detectOriginalLanguage(tracks: CaptionTrack[]): string | null {
  const asr = tracks.find((t) => t.kind === "asr");
  const code = (asr ?? tracks[0])?.languageCode;
  return typeof code === "string" && code.length > 0 ? code : null;
}

function baseLang(code: string): string {
  return code.toLowerCase().split("-")[0] ?? code.toLowerCase();
}

// Pull the transcript out of Firecrawl's markdown. Firecrawl labels it with an
// English `## Transcript` heading regardless of the transcript's language and
// puts it last; we take everything from that heading to the next heading (or
// the end) and collapse the one-word-per-line layout into flowing text.
export function extractTranscriptFromMarkdown(md: string): string {
  const heading = /^#{1,6}[ \t]+Transcript\b[^\n]*$/im.exec(md);
  if (!heading) return "";
  const start = heading.index + heading[0].length;
  const rest = md.slice(start);
  const next = /\n#{1,6}[ \t]+\S/.exec(rest);
  const section = next ? rest.slice(0, next.index) : rest;
  return section.replace(/\s+/g, " ").trim();
}

type FirecrawlMetadata = { title?: string; ogTitle?: string };

function cleanTitle(meta: FirecrawlMetadata | undefined): string {
  const fromOg = typeof meta?.ogTitle === "string" ? meta.ogTitle : undefined;
  const fromTitle =
    typeof meta?.title === "string"
      ? meta.title.replace(/\s*-\s*YouTube\s*$/i, "")
      : undefined;
  const raw = fromOg ?? fromTitle;
  if (typeof raw !== "string") return "";
  // Bound the title: it's untrusted scrape metadata, and an oversized title
  // joined to the transcript would otherwise consume the whole MAX_LENGTH budget
  // and evict the transcript the caller asked for. Real titles are <100 chars.
  return raw.replace(/\s+/g, " ").trim().slice(0, 200);
}

type FirecrawlData = {
  markdown?: string;
  rawHtml?: string;
  html?: string;
  metadata?: FirecrawlMetadata;
};

type FirecrawlScrapeResponse = {
  success?: boolean;
  error?: string;
  data?: FirecrawlData;
};

// Scrape a URL through Firecrawl. `proxy: "auto"` lets Firecrawl escalate to its
// stealth proxy pool when YouTube blocks plain requests; `maxAge: 0` disables
// the scrape cache so a changing playabilityStatus is never served stale;
// `location.languages` controls the language YouTube renders the transcript in;
// `onlyMainContent: false` keeps the `<script>` carrying ytInitialPlayerResponse
// in rawHtml.
async function firecrawlScrape(
  apiKey: string,
  url: string,
  languages: string[],
  formats: string[],
): Promise<FirecrawlData> {
  const response = await fetchWithTimeout(
    FIRECRAWL_SCRAPE_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url,
        formats,
        onlyMainContent: false,
        proxy: "auto",
        maxAge: 0,
        location: { languages },
        timeout: FIRECRAWL_TIMEOUT_MS,
      }),
    },
    // Allow the HTTP client slightly longer than Firecrawl's own timeout.
    FIRECRAWL_TIMEOUT_MS + 5_000,
    `Firecrawl scrape (${url})`,
  );
  if (!response.ok) {
    const body = await readTextCapped(response, MAX_BODY_BYTES).catch(() => "");
    throw new Error(
      `Firecrawl error ${response.status}: ${response.statusText}${body ? ` — ${body}` : ""}`,
    );
  }
  const text = await readTextCapped(response, MAX_BODY_BYTES);
  let parsed: FirecrawlScrapeResponse;
  try {
    parsed = JSON.parse(text) as FirecrawlScrapeResponse;
  } catch {
    throw new Error("Firecrawl returned a non-JSON response");
  }
  if (!parsed.success) {
    throw new Error(`Firecrawl scrape failed: ${parsed.error ?? "success=false"}`);
  }
  if (!parsed.data) {
    throw new Error("Firecrawl returned no data");
  }
  return parsed.data;
}

export function createYoutubeTranscriptTool(apiKey: string): Tool<Input, string> {
  return {
    name: "youtube_transcript",
    description:
      "Fetch the captions / transcript for a YouTube video and return it as plain text the model can summarise or quote. Accepts full watch URLs, youtu.be / m. / shorts URLs, or a bare 11-character video ID. By default the transcript comes back in the video's original language (auto-detected); pass a `language` ISO code only to force a (best-effort) translation. Throws if the video has no captions, is private, age-restricted, or otherwise unavailable.",
    parameters: Schema,
    execute: async ({ url, language }, ctx) => {
      const videoId = extractVideoId(url);
      const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
      // First pass: request the conversation language and grab both the player
      // JSON (to learn the original language) and the rendered transcript.
      const requested = language ?? ctx.lang;

      const first = await firecrawlScrape(apiKey, watchUrl, [requested], [
        "rawHtml",
        "markdown",
      ]);

      const html = first.rawHtml || first.html || "";
      if (html.length === 0) {
        throw new Error("Firecrawl returned an empty page");
      }

      const rawJson = extractPlayerResponseJson(html);
      let player: PlayerResponse;
      try {
        player = JSON.parse(rawJson) as PlayerResponse;
      } catch {
        throw new Error("Could not parse ytInitialPlayerResponse JSON");
      }

      const status = player.playabilityStatus?.status;
      if (status && status !== "OK") {
        const reason = player.playabilityStatus?.reason ?? "unknown reason";
        throw new Error(`Video unavailable (${status}): ${reason}`);
      }

      const tracks =
        player.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
      if (tracks.length === 0) {
        throw new Error(
          "This video has no captions (none uploaded and auto-captions unavailable).",
        );
      }

      let markdown = first.markdown ?? "";

      // No explicit language requested: prefer the video's original. The first
      // scrape used ctx.lang; if that isn't the original language, Firecrawl
      // gave us a (possibly garbled) translation, so re-fetch in the original.
      const originalLang = detectOriginalLanguage(tracks);
      if (
        !language &&
        originalLang &&
        baseLang(originalLang) !== baseLang(requested)
      ) {
        const second = await firecrawlScrape(apiKey, watchUrl, [originalLang], [
          "markdown",
        ]);
        markdown = second.markdown ?? markdown;
      }

      const transcript = extractTranscriptFromMarkdown(markdown);
      if (transcript.length === 0) {
        throw new Error("No transcript could be extracted for this video.");
      }

      const title = cleanTitle(first.metadata);
      const out = title ? `# ${title}\n\n${transcript}` : transcript;
      let capped = out.slice(0, MAX_LENGTH);
      // A slice at MAX_LENGTH can leave a trailing lone high surrogate; drop it.
      if (capped.length === MAX_LENGTH) {
        const last = capped.charCodeAt(capped.length - 1);
        if (last >= 0xd800 && last <= 0xdbff) {
          capped = capped.slice(0, -1);
        }
      }
      return capped;
    },
  };
}
