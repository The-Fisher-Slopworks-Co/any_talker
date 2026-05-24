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
const URL_VIDEO_ID_RE =
  /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;

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
  const decodeOnce = (input: string): string =>
    input
      .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) =>
        String.fromCodePoint(Number.parseInt(hex, 16)),
      )
      .replace(/&#(\d+);/g, (_m, dec: string) =>
        String.fromCodePoint(Number.parseInt(dec, 10)),
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
  const marker = "ytInitialPlayerResponse";
  const markerIdx = html.indexOf(marker);
  if (markerIdx === -1) {
    throw new Error("Could not find ytInitialPlayerResponse on the page");
  }
  const braceStart = html.indexOf("{", markerIdx);
  if (braceStart === -1) {
    throw new Error("Could not find ytInitialPlayerResponse JSON body");
  }
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
  const cueRe = /<(?:text|p)\b[^>]*>([\s\S]*?)<\/(?:text|p)>/g;
  const lines: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = cueRe.exec(xml)) !== null) {
    const raw = match[1];
    if (raw === undefined) continue;
    const stripped = raw.replace(/<[^>]+>/g, "");
    const decoded = decodeHtmlEntities(stripped).replace(/\s+/g, " ").trim();
    if (decoded.length > 0) lines.push(decoded);
  }
  return lines.join("\n");
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

    const captionResp = await safeFetch(track.baseUrl, {
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
      throw new Error(
        `Caption track returned HTTP ${captionResp.status}: ${captionResp.statusText}`,
      );
    }
    const captionXml = await readTextCapped(captionResp, MAX_BODY_BYTES);
    const body = parseCaptionXml(captionXml);

    if (body.length === 0) {
      throw new Error("Caption track returned no cues");
    }

    const title = player.videoDetails?.title?.trim();
    const out = title ? `# ${title}\n\n${body}` : body;
    return out.slice(0, MAX_LENGTH);
  },
};
