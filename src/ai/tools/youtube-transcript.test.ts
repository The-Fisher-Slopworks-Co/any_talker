// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe, mock, beforeEach, afterEach } from "bun:test";
import {
  createYoutubeTranscriptTool,
  extractVideoId,
  extractPlayerResponseJson,
  detectOriginalLanguage,
  extractTranscriptFromMarkdown,
} from "./youtube-transcript";
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

const VIDEO_ID = "dQw4w9WgXcQ";

const mockFetch = mock(
  (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
    Promise.resolve(new Response("", { status: 200 })),
);
const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = mockFetch as unknown as typeof fetch;
  mockFetch.mockReset();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function buildPlayerResponse(opts: {
  tracks?: Array<{ languageCode: string; kind?: string }>;
  captionsBlock?: object | null;
  playabilityStatus?: { status: string; reason?: string };
}): string {
  const player: Record<string, unknown> = {};
  if (opts.playabilityStatus) {
    player.playabilityStatus = opts.playabilityStatus;
  }
  if (opts.captionsBlock !== undefined) {
    if (opts.captionsBlock !== null) {
      player.captions = opts.captionsBlock;
    }
  } else if (opts.tracks) {
    player.captions = {
      playerCaptionsTracklistRenderer: { captionTracks: opts.tracks },
    };
  }
  return JSON.stringify(player);
}

function watchPageHtml(playerJson: string): string {
  // YouTube embeds it like `var ytInitialPlayerResponse = {...};` — we add a
  // bit of trailing JS to make sure the brace walker stops at the right `}`.
  return `<!DOCTYPE html><html><body><script>
    var ytInitialPlayerResponse = ${playerJson};
    var other = {nested: {value: 1}};
  </script></body></html>`;
}

// Firecrawl renders the transcript one word per line under an English
// `## Transcript` heading, after the description section.
function markdownDoc(opts: { ogTitle?: string; transcript?: string }): string {
  const head = opts.ogTitle ? `# [${opts.ogTitle}](https://x)\n\n` : "";
  const desc = "## Description\n\nsome description text\n\n";
  const tr =
    opts.transcript === undefined
      ? ""
      : `## Transcript\n\n${opts.transcript.split(" ").join("\n")}\n`;
  return `${head}${desc}${tr}`;
}

// Wrap data in a Firecrawl /scrape success envelope.
function firecrawlEnvelope(data: {
  rawHtml?: string;
  markdown?: string;
  metadata?: { title?: string; ogTitle?: string };
}): Response {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function bodyOf(call: [RequestInfo | URL, RequestInit?] | undefined): {
  location?: { languages?: string[] };
  formats?: string[];
} {
  return JSON.parse(String(call?.[1]?.body));
}

const tool = createYoutubeTranscriptTool("test-api-key");

describe("extractVideoId", () => {
  test.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&feature=share&t=42", "dQw4w9WgXcQ"],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?t=10", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["  dQw4w9WgXcQ  ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/watch?app=desktop&v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    // Duplicate v= params: take the FIRST, as YouTube does (not the last).
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&v=ZZZZZZZZZZZ", "dQw4w9WgXcQ"],
  ])("extracts id from %s", (input, expected) => {
    expect(extractVideoId(input)).toBe(expected);
  });

  test.each([
    "",
    "not a url",
    "https://example.com/page",
    "https://www.youtube.com/",
    "https://www.youtube.com/watch?v=tooShort",
    "https://vimeo.com/12345",
    // 12+ id chars: reject rather than silently truncate to the first 11.
    "https://www.youtube.com/watch?v=dQw4w9WgXcQX",
  ])("throws on invalid input: %s", (input) => {
    expect(() => extractVideoId(input)).toThrow();
  });
});

describe("extractPlayerResponseJson", () => {
  test("returns the matched-brace JSON body", () => {
    const json = '{"a":1,"b":{"c":2}}';
    const html = `<script>var ytInitialPlayerResponse = ${json}; var trailing = 1;</script>`;
    expect(extractPlayerResponseJson(html)).toBe(json);
  });

  test("respects string literals containing braces", () => {
    const json = '{"text":"a}b{c","n":1}';
    const html = `<script>ytInitialPlayerResponse = ${json};</script>`;
    expect(extractPlayerResponseJson(html)).toBe(json);
  });

  test("respects escaped quotes inside strings", () => {
    const json = '{"q":"He said \\"}\\" loudly","n":1}';
    const html = `<script>ytInitialPlayerResponse = ${json};</script>`;
    expect(extractPlayerResponseJson(html)).toBe(json);
  });

  test("throws when the marker is absent", () => {
    expect(() => extractPlayerResponseJson("<html>nothing here</html>")).toThrow(
      "Could not find ytInitialPlayerResponse",
    );
  });

  test("anchors on the assignment when the marker appears earlier in a string", () => {
    const json = '{"real":true,"n":1}';
    const html = `<script>var note = "ytInitialPlayerResponse is set below";
      var ytInitialPlayerResponse = ${json};</script>`;
    expect(extractPlayerResponseJson(html)).toBe(json);
  });
});

describe("detectOriginalLanguage", () => {
  test("uses the asr track's language as the spoken/original language", () => {
    expect(
      detectOriginalLanguage([
        { languageCode: "en" },
        { languageCode: "ru", kind: "asr" },
      ]),
    ).toBe("ru");
  });

  test("falls back to the first track when none is asr", () => {
    expect(
      detectOriginalLanguage([{ languageCode: "de" }, { languageCode: "fr" }]),
    ).toBe("de");
  });

  test("returns null when no track has a usable languageCode", () => {
    expect(detectOriginalLanguage([{ kind: "asr" }])).toBeNull();
    expect(detectOriginalLanguage([])).toBeNull();
  });
});

describe("extractTranscriptFromMarkdown", () => {
  test("extracts the Transcript section and collapses the one-word-per-line layout", () => {
    const md = markdownDoc({ transcript: "hello there world" });
    expect(extractTranscriptFromMarkdown(md)).toBe("hello there world");
  });

  test("stops at the next heading after the transcript", () => {
    const md = "## Transcript\n\nthe\nactual\ntext\n\n## Comments\n\njunk here";
    expect(extractTranscriptFromMarkdown(md)).toBe("the actual text");
  });

  test("returns empty string when there is no Transcript heading", () => {
    expect(extractTranscriptFromMarkdown(markdownDoc({}))).toBe("");
  });
});

describe("youtube_transcript tool", () => {
  test("schema rejects empty url", () => {
    expect(tool.parameters.safeParse({ url: "" }).success).toBe(false);
  });

  test("throws a clear error on an invalid URL before any fetch", async () => {
    await expect(
      tool.execute({ url: "https://example.com/no-id-here" }, ctx),
    ).rejects.toThrow("Could not extract a YouTube video ID");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("happy path: one scrape when the chat language is the original", async () => {
    // ctx.lang is "en" and the only track is en, so no re-scrape is needed.
    const rawHtml = watchPageHtml(buildPlayerResponse({ tracks: [{ languageCode: "en" }] }));
    mockFetch.mockResolvedValue(
      firecrawlEnvelope({
        rawHtml,
        markdown: markdownDoc({ transcript: "never gonna give you up" }),
        metadata: { ogTitle: "Never Gonna" },
      }),
    );

    const result = await tool.execute({ url: VIDEO_ID }, ctx);
    expect(result).toBe("# Never Gonna\n\nnever gonna give you up");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const sent = bodyOf(mockFetch.mock.calls[0]);
    expect(String(mockFetch.mock.calls[0]![0])).toBe("https://api.firecrawl.dev/v2/scrape");
    expect(sent.formats).toEqual(["rawHtml", "markdown"]);
    expect(sent.location?.languages).toEqual(["en"]);
  });

  test("re-scrapes in the original language when it differs from the chat language", async () => {
    // ctx.lang "en" but the video is ru(asr): first scrape comes back in en
    // (a translation), so the tool re-fetches in ru.
    const rawHtml = watchPageHtml(
      buildPlayerResponse({ tracks: [{ languageCode: "ru", kind: "asr" }] }),
    );
    mockFetch.mockImplementation((_input, init) => {
      const langs = JSON.parse(String((init as RequestInit)?.body)).location?.languages;
      if (Array.isArray(langs) && langs[0] === "ru") {
        return Promise.resolve(
          firecrawlEnvelope({ markdown: markdownDoc({ transcript: "оригинальный русский текст" }) }),
        );
      }
      return Promise.resolve(
        firecrawlEnvelope({
          rawHtml,
          markdown: markdownDoc({ transcript: "garbled english translation" }),
          metadata: { ogTitle: "Заголовок" },
        }),
      );
    });

    const result = await tool.execute({ url: VIDEO_ID }, ctx);
    expect(result).toBe("# Заголовок\n\nоригинальный русский текст");
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(bodyOf(mockFetch.mock.calls[0]).location?.languages).toEqual(["en"]);
    expect(bodyOf(mockFetch.mock.calls[1]).location?.languages).toEqual(["ru"]);
    expect(bodyOf(mockFetch.mock.calls[1]).formats).toEqual(["markdown"]);
  });

  test("an explicit language forces that language and skips re-scraping", async () => {
    const rawHtml = watchPageHtml(
      buildPlayerResponse({ tracks: [{ languageCode: "ru", kind: "asr" }] }),
    );
    mockFetch.mockResolvedValue(
      firecrawlEnvelope({
        rawHtml,
        markdown: markdownDoc({ transcript: "forced translation" }),
        metadata: { ogTitle: "T" },
      }),
    );

    const result = await tool.execute({ url: VIDEO_ID, language: "de" }, ctx);
    expect(result).toBe("# T\n\nforced translation");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(bodyOf(mockFetch.mock.calls[0]).location?.languages).toEqual(["de"]);
  });

  test("falls back to the video title minus the ' - YouTube' suffix", async () => {
    const rawHtml = watchPageHtml(buildPlayerResponse({ tracks: [{ languageCode: "en" }] }));
    mockFetch.mockResolvedValue(
      firecrawlEnvelope({
        rawHtml,
        markdown: markdownDoc({ transcript: "cue" }),
        metadata: { title: "My Video - YouTube" },
      }),
    );
    const result = await tool.execute({ url: VIDEO_ID }, ctx);
    expect(result).toBe("# My Video\n\ncue");
  });

  test("omits the heading when no title is present", async () => {
    const rawHtml = watchPageHtml(buildPlayerResponse({ tracks: [{ languageCode: "en" }] }));
    mockFetch.mockResolvedValue(
      firecrawlEnvelope({ rawHtml, markdown: markdownDoc({ transcript: "just the cue" }) }),
    );
    const result = await tool.execute({ url: VIDEO_ID }, ctx);
    expect(result).toBe("just the cue");
  });

  test("throws when the video has no caption tracks", async () => {
    const rawHtml = watchPageHtml(buildPlayerResponse({ captionsBlock: null }));
    mockFetch.mockResolvedValue(firecrawlEnvelope({ rawHtml, markdown: markdownDoc({}) }));
    await expect(tool.execute({ url: VIDEO_ID }, ctx)).rejects.toThrow("no captions");
  });

  test("throws on unavailable / private videos via playabilityStatus", async () => {
    const rawHtml = watchPageHtml(
      buildPlayerResponse({
        playabilityStatus: { status: "LOGIN_REQUIRED", reason: "Sign in to confirm your age" },
        tracks: [],
      }),
    );
    mockFetch.mockResolvedValue(firecrawlEnvelope({ rawHtml, markdown: "" }));
    await expect(tool.execute({ url: VIDEO_ID }, ctx)).rejects.toThrow("Video unavailable");
  });

  test("throws when tracks exist but the markdown has no transcript section", async () => {
    const rawHtml = watchPageHtml(buildPlayerResponse({ tracks: [{ languageCode: "en" }] }));
    mockFetch.mockResolvedValue(firecrawlEnvelope({ rawHtml, markdown: markdownDoc({}) }));
    await expect(tool.execute({ url: VIDEO_ID }, ctx)).rejects.toThrow(
      "No transcript could be extracted",
    );
  });

  test("throws when the page lacks ytInitialPlayerResponse", async () => {
    mockFetch.mockResolvedValue(
      firecrawlEnvelope({ rawHtml: "<html><body>Cookie wall</body></html>", markdown: "" }),
    );
    await expect(tool.execute({ url: VIDEO_ID }, ctx)).rejects.toThrow(
      "Could not find ytInitialPlayerResponse",
    );
  });

  test("caps output at MAX_LENGTH (50 000)", async () => {
    const rawHtml = watchPageHtml(buildPlayerResponse({ tracks: [{ languageCode: "en" }] }));
    mockFetch.mockResolvedValue(
      firecrawlEnvelope({
        rawHtml,
        markdown: `## Transcript\n\n${"x".repeat(60_000)}`,
        metadata: { ogTitle: "T" },
      }),
    );
    const result = await tool.execute({ url: VIDEO_ID }, ctx);
    expect(result.length).toBe(50_000);
  });

  test("a huge title does not evict the transcript from the MAX_LENGTH budget", async () => {
    const rawHtml = watchPageHtml(buildPlayerResponse({ tracks: [{ languageCode: "en" }] }));
    mockFetch.mockResolvedValue(
      firecrawlEnvelope({
        rawHtml,
        markdown: markdownDoc({ transcript: "the actual transcript" }),
        metadata: { ogTitle: "T".repeat(60_000) },
      }),
    );
    const result = await tool.execute({ url: VIDEO_ID }, ctx);
    // Title is bounded, so the transcript still makes it into the output.
    expect(result).toContain("the actual transcript");
    expect(result.length).toBeLessThan(1_000);
  });

  test("returns a well-formed string when MAX_LENGTH cuts mid-surrogate", async () => {
    const rawHtml = watchPageHtml(buildPlayerResponse({ tracks: [{ languageCode: "en" }] }));
    // Fill to just under the boundary so an emoji surrogate pair straddles it.
    const body = "x".repeat(49_999) + "😀".repeat(100);
    mockFetch.mockResolvedValue(
      firecrawlEnvelope({ rawHtml, markdown: `## Transcript\n\n${body}` }),
    );
    const result = await tool.execute({ url: VIDEO_ID }, ctx);
    expect(result.isWellFormed()).toBe(true);
    const last = result.charCodeAt(result.length - 1);
    expect(last >= 0xd800 && last <= 0xdbff).toBe(false);
  });

  test("surfaces Firecrawl success=false as an error", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: "blocked" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(tool.execute({ url: VIDEO_ID }, ctx)).rejects.toThrow(
      "Firecrawl scrape failed: blocked",
    );
  });

  test("surfaces a non-2xx Firecrawl response as an error", async () => {
    mockFetch.mockResolvedValue(
      new Response("rate limited", { status: 429, statusText: "Too Many Requests" }),
    );
    await expect(tool.execute({ url: VIDEO_ID }, ctx)).rejects.toThrow("Firecrawl error 429");
  });

  test("throws when Firecrawl returns an empty page", async () => {
    mockFetch.mockResolvedValue(firecrawlEnvelope({ rawHtml: "", markdown: "" }));
    await expect(tool.execute({ url: VIDEO_ID }, ctx)).rejects.toThrow(
      "Firecrawl returned an empty page",
    );
  });
});
