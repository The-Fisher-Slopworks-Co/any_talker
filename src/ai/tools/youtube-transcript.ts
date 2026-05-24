// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { z } from "zod";
import { readTextCapped, safeFetch } from "./http";
import type { Tool } from "./registry";

const MAX_LENGTH = 50_000;
const MAX_BODY_BYTES = 10_000_000;
const TIMEOUT_MS = 15_000;

// A real-browser-ish UA is required: YouTube serves a stripped page without
// `ytInitialPlayerResponse` to obvious bots.
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

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
      "Optional ISO language code for the caption track (e.g. 'en', 'ru'). If omitted, picks the first available track, preferring manual over auto-generated.",
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
  baseUrl: string;
  languageCode: string;
  kind?: string;
  name?: { simpleText?: string; runs?: Array<{ text?: string }> };
  vssId?: string;
};

type PlayerResponse = {
  videoDetails?: { title?: string };
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: CaptionTrack[];
    };
  };
  playabilityStatus?: { status?: string; reason?: string };
};

// Decode HTML entities. YouTube's caption XML is double-encoded: a cue body of
// `it's` ships as `it&amp;#39;s`, which decodes to `it&#39;s` after one pass and
// to `it's` after two. Run two passes so both layers unwrap.
export function decodeHtmlEntities(s: string): string {
  // Reject out-of-range and lone-surrogate code points so fromCodePoint never
  // throws RangeError or emits a corrupt surrogate; substitute U+FFFD instead.
  const safeFromCodePoint = (cp: number): string => {
    if (!Number.isFinite(cp) || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) {
      return "�";
    }
    return String.fromCodePoint(cp);
  };
  const decodeOnce = (input: string): string =>
    input
      .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) =>
        safeFromCodePoint(Number.parseInt(hex, 16)),
      )
      .replace(/&#(\d+);/g, (_m, dec: string) =>
        safeFromCodePoint(Number.parseInt(dec, 10)),
      )
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&");
  return decodeOnce(decodeOnce(s));
}

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

function pickTrack(tracks: CaptionTrack[], language?: string): CaptionTrack {
  if (language) {
    const lang = language.toLowerCase();
    const exactManual = tracks.find(
      (t) => t.languageCode.toLowerCase() === lang && t.kind !== "asr",
    );
    if (exactManual) return exactManual;
    const exactAuto = tracks.find((t) => t.languageCode.toLowerCase() === lang);
    if (exactAuto) return exactAuto;
    const prefixManual = tracks.find(
      (t) =>
        t.languageCode.toLowerCase().startsWith(`${lang}-`) && t.kind !== "asr",
    );
    if (prefixManual) return prefixManual;
    const prefixAny = tracks.find((t) =>
      t.languageCode.toLowerCase().startsWith(`${lang}-`),
    );
    if (prefixAny) return prefixAny;
    const available = tracks.map((t) => t.languageCode).join(", ");
    throw new Error(
      `No caption track for language '${language}'. Available: ${available || "(none)"}`,
    );
  }
  const manual = tracks.find((t) => t.kind !== "asr");
  if (manual) return manual;
  const first = tracks[0];
  if (!first) throw new Error("No caption tracks available");
  return first;
}

// Parse SRV3/TTML caption XML. Cues are simple <text ...>body</text> elements
// (transcript endpoint) or <p ...>body</p> (TTML). Body may contain nested
// tags; we strip them before decoding entities.
export function parseCaptionXml(xml: string): string {
  // Manual scan instead of a lazy `[\s\S]*?` cue regex: that backtracks
  // quadratically on input with many unclosed `<text` openings. We find each
  // opening, then the next closing tag via indexOf; once a tag kind has no
  // remaining close we stop searching for it, keeping the whole pass linear.
  const openRe = /<(text|p)\b[^>]*>/g;
  const lines: string[] = [];
  const closeExhausted = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(xml)) !== null) {
    const tag = match[1]!;
    const closeTag = `</${tag}>`;
    if (closeExhausted.has(closeTag)) continue;
    const bodyStart = match.index + match[0].length;
    const closeIdx = xml.indexOf(closeTag, bodyStart);
    if (closeIdx === -1) {
      closeExhausted.add(closeTag);
      continue;
    }
    const raw = xml.slice(bodyStart, closeIdx);
    const stripped = raw.replace(/<[^>]+>/g, "");
    const decoded = decodeHtmlEntities(stripped).replace(/\s+/g, " ").trim();
    if (decoded.length > 0) lines.push(decoded);
    openRe.lastIndex = closeIdx + closeTag.length;
  }
  return lines.join("\n");
}

type Json3Caption = {
  events?: Array<{ segs?: Array<{ utf8?: string }> }>;
};

// Parse YouTube's JSON3 caption format: one line per event, joining its
// segment `utf8` chunks. Entities are decoded for parity with the XML path.
export function parseCaptionJson3(json: string): string {
  let parsed: Json3Caption;
  try {
    parsed = JSON.parse(json) as Json3Caption;
  } catch {
    return "";
  }
  const lines: string[] = [];
  for (const event of parsed.events ?? []) {
    const text = (event.segs ?? [])
      .map((seg) => seg.utf8 ?? "")
      .join("");
    const decoded = decodeHtmlEntities(text).replace(/\s+/g, " ").trim();
    if (decoded.length > 0) lines.push(decoded);
  }
  return lines.join("\n");
}

// Dispatch on the body shape: JSON3 (starts with `{`) falls back to the JSON
// parser, everything else is treated as caption XML.
export function parseCaptions(body: string): string {
  if (body.trimStart().startsWith("{")) {
    return parseCaptionJson3(body);
  }
  return parseCaptionXml(body);
}

export const youtubeTranscriptTool: Tool<Input, string> = {
  name: "youtube_transcript",
  description:
    "Fetch the public captions / transcript for a YouTube video and return it as plain text the model can summarise or quote. Accepts full watch URLs, youtu.be / m. / shorts URLs, or a bare 11-character video ID. Optionally select a caption language by ISO code (e.g. 'en', 'ru'); otherwise the first available track is used (preferring manual over auto-generated). Throws if the video has no captions, is private, age-restricted, or otherwise unavailable.",
  parameters: Schema,
  execute: async ({ url, language }, _ctx) => {
    const videoId = extractVideoId(url);
    // bpctr/has_verified reduce the chance of hitting the consent or age wall
    // (the player JSON is omitted from those interstitial pages).
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}&bpctr=9999999999&has_verified=1`;

    const pageResp = await safeFetch(watchUrl, {
      init: {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      },
      timeoutMs: TIMEOUT_MS,
      timeoutLabel: `Fetching YouTube page for ${videoId}`,
    });
    if (!pageResp.ok) {
      // Drain so Bun can release the connection before throwing.
      await pageResp.body?.cancel().catch(() => {});
      throw new Error(`YouTube watch page returned HTTP ${pageResp.status}`);
    }
    const html = await readTextCapped(pageResp, MAX_BODY_BYTES);

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

    const track = pickTrack(tracks, language);

    // The player JSON is a type-only cast; guard against a track whose baseUrl
    // is missing or non-string so we don't hand `undefined` to safeFetch.
    const baseUrl = track.baseUrl;
    if (typeof baseUrl !== "string" || baseUrl.length === 0) {
      throw new Error("Selected caption track has no usable URL");
    }

    const captionResp = await safeFetch(baseUrl, {
      init: {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/xml,text/xml,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      },
      timeoutMs: TIMEOUT_MS,
      timeoutLabel: `Fetching captions for ${videoId}`,
    });
    if (!captionResp.ok) {
      // Drain so Bun can release the connection before throwing.
      await captionResp.body?.cancel().catch(() => {});
      throw new Error(
        `Caption track returned HTTP ${captionResp.status}: ${captionResp.statusText}`,
      );
    }
    const captionBody = await readTextCapped(captionResp, MAX_BODY_BYTES);
    const body = parseCaptions(captionBody);

    if (body.length === 0) {
      throw new Error("Caption track returned no cues");
    }

    const rawTitle = player.videoDetails?.title;
    const title =
      typeof rawTitle === "string" ? rawTitle.replace(/\s+/g, " ").trim() : "";
    const out = title ? `# ${title}\n\n${body}` : body;
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
