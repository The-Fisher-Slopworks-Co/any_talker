// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe, mock, beforeEach, afterEach } from "bun:test";
import {
  createYoutubeTranscriptTool,
  extractVideoId,
  decodeHtmlEntities,
  extractPlayerResponseJson,
  parseCaptionXml,
  parseCaptionJson3,
  parseCaptions,
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
const CAPTION_BASE_URL = "https://www.youtube.com/api/timedtext?v=dQw4w9WgXcQ&lang=en";

const mockFetch = mock(
  (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
    Promise.resolve(new Response("", { status: 200 })),
);
const originalFetch = globalThis.fetch;
const originalDnsLookup = Bun.dns.lookup;

beforeEach(() => {
  globalThis.fetch = mockFetch as unknown as typeof fetch;
  mockFetch.mockReset();
  // Stub DNS so safeFetch's IP pinning resolves to a deterministic public IP
  // without performing real lookups in tests.
  (Bun.dns as { lookup: typeof Bun.dns.lookup }).lookup = (async () =>
    [{ address: "203.0.113.10", family: 4, ttl: 60 }]) as typeof Bun.dns.lookup;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  (Bun.dns as { lookup: typeof Bun.dns.lookup }).lookup = originalDnsLookup;
});

function buildPlayerResponse(opts: {
  title?: string;
  tracks?: Array<{
    baseUrl: string;
    languageCode: string;
    kind?: string;
    name?: { simpleText?: string };
  }>;
  captionsBlock?: object | null;
  playabilityStatus?: { status: string; reason?: string };
}): string {
  const player: Record<string, unknown> = {};
  if (opts.title) {
    player.videoDetails = { title: opts.title };
  }
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

function srv3Xml(cues: Array<{ start?: string; dur?: string; text: string }>): string {
  const items = cues
    .map(
      (c) =>
        `<text start="${c.start ?? "0"}" dur="${c.dur ?? "1"}">${c.text}</text>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="utf-8"?><transcript>${items}</transcript>`;
}

// Wrap page HTML in a Firecrawl /scrape success envelope. The tool fetches the
// watch page via Firecrawl (reads data.rawHtml), then the caption track directly.
function firecrawlEnvelope(pageHtml: string): Response {
  return new Response(
    JSON.stringify({ success: true, data: { rawHtml: pageHtml } }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

// Dispatch by URL: the Firecrawl scrape endpoint gets the page envelope; any
// other request (the direct, IP-pinned caption fetch) gets the caption body.
function mockTwoCalls(pageHtml: string, captionXml: string) {
  mockFetch.mockImplementation((input: RequestInfo | URL) => {
    const u = typeof input === "string" ? input : input.toString();
    if (u.includes("api.firecrawl.dev")) {
      return Promise.resolve(firecrawlEnvelope(pageHtml));
    }
    return Promise.resolve(
      new Response(captionXml, {
        status: 200,
        headers: { "content-type": "application/xml" },
      }),
    );
  });
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

describe("decodeHtmlEntities", () => {
  test("decodes double-encoded apostrophe (it&amp;#39;s -> it's)", () => {
    expect(decodeHtmlEntities("it&amp;#39;s")).toBe("it's");
  });

  test("decodes named and numeric entities in one pass", () => {
    expect(decodeHtmlEntities("&lt;b&gt;hi&lt;/b&gt; &amp; bye")).toBe(
      "<b>hi</b> & bye",
    );
  });

  test("decodes hex numeric entity", () => {
    expect(decodeHtmlEntities("&#x2014;")).toBe("—");
  });

  test("passes through plain text unchanged", () => {
    expect(decodeHtmlEntities("hello world")).toBe("hello world");
  });

  test("substitutes U+FFFD for an out-of-range code point without throwing", () => {
    expect(() => decodeHtmlEntities("&#x110000;")).not.toThrow();
    expect(decodeHtmlEntities("&#x110000;")).toBe("�");
  });

  test("substitutes U+FFFD for a lone surrogate (hex and decimal)", () => {
    expect(decodeHtmlEntities("&#xD800;")).toBe("�");
    expect(decodeHtmlEntities("&#55296;")).toBe("�");
  });

  test("still decodes valid numeric entities at the upper range", () => {
    expect(decodeHtmlEntities("&#x1F600;")).toBe("😀");
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

  test("anchors on the assignment when the marker appears earlier in a comment", () => {
    const json = '{"real":true,"n":2}';
    const html = `<script>// ytInitialPlayerResponse mentioned in a comment {oops}
      var ytInitialPlayerResponse = ${json};</script>`;
    expect(extractPlayerResponseJson(html)).toBe(json);
  });
});

describe("parseCaptionXml", () => {
  test("joins SRV3 <text> cues with newlines and decodes entities", () => {
    const xml = srv3Xml([
      { text: "Hello world" },
      { text: "it&amp;#39;s a test" },
      { text: "&lt;tag&gt; and &amp; symbol" },
    ]);
    expect(parseCaptionXml(xml)).toBe(
      "Hello world\nit's a test\n<tag> and & symbol",
    );
  });

  test("strips nested cue formatting tags", () => {
    const xml = `<transcript><text start="0" dur="1">hello <b>bold</b> world</text></transcript>`;
    expect(parseCaptionXml(xml)).toBe("hello bold world");
  });

  test("skips empty cues", () => {
    const xml = srv3Xml([{ text: "real" }, { text: "" }, { text: "   " }]);
    expect(parseCaptionXml(xml)).toBe("real");
  });

  test("handles many unclosed <text> openings in linear time", () => {
    // The old lazy `[\s\S]*?` regex backtracks quadratically on this input and
    // stalls (~1.7s); the manual scan returns promptly (and matches no cues).
    const pathological = "<text>".repeat(100_000);
    const start = Date.now();
    const result = parseCaptionXml(pathological);
    const elapsed = Date.now() - start;
    expect(result).toBe("");
    expect(elapsed).toBeLessThan(500);
  });
});

describe("parseCaptionJson3 / parseCaptions", () => {
  test("joins JSON3 events and segments, decoding entities", () => {
    const json3 = JSON.stringify({
      events: [
        { segs: [{ utf8: "Hello " }, { utf8: "world" }] },
        { segs: [{ utf8: "it&amp;#39;s" }, { utf8: " a test" }] },
        { segs: [{ utf8: "   " }] },
      ],
    });
    expect(parseCaptionJson3(json3)).toBe("Hello world\nit's a test");
  });

  test("parseCaptions dispatches JSON3 bodies to the JSON parser", () => {
    const json3 = JSON.stringify({
      events: [{ segs: [{ utf8: "json3 cue" }] }],
    });
    expect(parseCaptions(json3)).toBe("json3 cue");
  });

  test("parseCaptions still parses XML bodies", () => {
    const xml = srv3Xml([{ text: "xml cue" }]);
    expect(parseCaptions(xml)).toBe("xml cue");
  });
});

describe("youtube_transcript tool", () => {
  test("schema rejects empty url", () => {
    expect(tool.parameters.safeParse({ url: "" }).success).toBe(
      false,
    );
  });

  test("happy path: returns title + cues for default track", async () => {
    const playerJson = buildPlayerResponse({
      title: "Never Gonna",
      tracks: [
        { baseUrl: CAPTION_BASE_URL, languageCode: "en" },
      ],
    });
    mockTwoCalls(
      watchPageHtml(playerJson),
      srv3Xml([{ text: "Never gonna give you up" }, { text: "Never gonna let you down" }]),
    );

    const result = await tool.execute({ url: `https://youtu.be/${VIDEO_ID}` }, ctx);
    expect(result).toBe(
      "# Never Gonna\n\nNever gonna give you up\nNever gonna let you down",
    );
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  test("prefers manual over auto-generated when no language requested", async () => {
    const autoUrl = "https://example.com/cap?lang=en&kind=asr";
    const manualUrl = "https://example.com/cap?lang=ru";
    const playerJson = buildPlayerResponse({
      title: "T",
      tracks: [
        { baseUrl: autoUrl, languageCode: "en", kind: "asr" },
        { baseUrl: manualUrl, languageCode: "ru" },
      ],
    });
    let secondCallUrl = "";
    let call = 0;
    mockFetch.mockImplementation((input: RequestInfo | URL) => {
      call++;
      if (call === 1) {
        return Promise.resolve(firecrawlEnvelope(watchPageHtml(playerJson)));
      }
      secondCallUrl = typeof input === "string" ? input : input.toString();
      return Promise.resolve(
        new Response(srv3Xml([{ text: "manual cue" }]), {
          status: 200,
          headers: { "content-type": "application/xml" },
        }),
      );
    });

    const result = await tool.execute({ url: VIDEO_ID }, ctx);
    expect(result).toContain("manual cue");
    // safeFetch pins the host to the stubbed IP so the URL we see has the IP
    // as hostname. Path + query are preserved, so assert against those.
    expect(secondCallUrl).toContain("/cap");
    expect(secondCallUrl).toContain("lang=ru");
  });

  test("picks requested language when present (auto only)", async () => {
    const enUrl = "https://example.com/cap?lang=en";
    const ruUrl = "https://example.com/cap?lang=ru&kind=asr";
    const playerJson = buildPlayerResponse({
      title: "T",
      tracks: [
        { baseUrl: enUrl, languageCode: "en" },
        { baseUrl: ruUrl, languageCode: "ru", kind: "asr" },
      ],
    });
    let secondCallUrl = "";
    let call = 0;
    mockFetch.mockImplementation((input: RequestInfo | URL) => {
      call++;
      if (call === 1) {
        return Promise.resolve(firecrawlEnvelope(watchPageHtml(playerJson)));
      }
      secondCallUrl = typeof input === "string" ? input : input.toString();
      return Promise.resolve(
        new Response(srv3Xml([{ text: "russian cue" }]), {
          status: 200,
          headers: { "content-type": "application/xml" },
        }),
      );
    });

    const result = await tool.execute(
      { url: VIDEO_ID, language: "ru" },
      ctx,
    );
    expect(result).toContain("russian cue");
    expect(secondCallUrl).toContain("lang=ru");
  });

  test("throws when requested language is absent", async () => {
    const playerJson = buildPlayerResponse({
      title: "T",
      tracks: [
        { baseUrl: "https://example.com/cap?lang=en", languageCode: "en" },
      ],
    });
    mockFetch.mockImplementation(() =>
      Promise.resolve(firecrawlEnvelope(watchPageHtml(playerJson))),
    );
    await expect(
      tool.execute({ url: VIDEO_ID, language: "ja" }, ctx),
    ).rejects.toThrow("No caption track for language 'ja'");
  });

  test("throws when captions are disabled (no playerCaptionsTracklistRenderer)", async () => {
    const playerJson = buildPlayerResponse({
      title: "T",
      captionsBlock: null,
    });
    mockFetch.mockImplementation(() =>
      Promise.resolve(firecrawlEnvelope(watchPageHtml(playerJson))),
    );
    await expect(
      tool.execute({ url: VIDEO_ID }, ctx),
    ).rejects.toThrow("no captions");
  });

  test("throws when caption tracks list is empty", async () => {
    const playerJson = buildPlayerResponse({
      title: "T",
      captionsBlock: { playerCaptionsTracklistRenderer: { captionTracks: [] } },
    });
    mockFetch.mockImplementation(() =>
      Promise.resolve(firecrawlEnvelope(watchPageHtml(playerJson))),
    );
    await expect(
      tool.execute({ url: VIDEO_ID }, ctx),
    ).rejects.toThrow("no captions");
  });

  test("throws on unavailable / private videos via playabilityStatus", async () => {
    const playerJson = buildPlayerResponse({
      playabilityStatus: { status: "LOGIN_REQUIRED", reason: "Sign in to confirm your age" },
      tracks: [],
    });
    mockFetch.mockImplementation(() =>
      Promise.resolve(firecrawlEnvelope(watchPageHtml(playerJson))),
    );
    await expect(
      tool.execute({ url: VIDEO_ID }, ctx),
    ).rejects.toThrow("Video unavailable");
  });

  test("caps output at MAX_LENGTH (50 000)", async () => {
    const longCue = "x".repeat(60_000);
    const playerJson = buildPlayerResponse({
      title: "T",
      tracks: [{ baseUrl: CAPTION_BASE_URL, languageCode: "en" }],
    });
    mockTwoCalls(
      watchPageHtml(playerJson),
      srv3Xml([{ text: longCue }]),
    );
    const result = await tool.execute({ url: VIDEO_ID }, ctx);
    expect(result.length).toBe(50_000);
  });

  test("throws clear error on invalid URL", async () => {
    await expect(
      tool.execute({ url: "https://example.com/no-id-here" }, ctx),
    ).rejects.toThrow("Could not extract a YouTube video ID");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("throws when the watch page lacks ytInitialPlayerResponse", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(firecrawlEnvelope("<html><body>Cookie wall</body></html>")),
    );
    await expect(
      tool.execute({ url: VIDEO_ID }, ctx),
    ).rejects.toThrow("Could not find ytInitialPlayerResponse");
  });

  test("throws a clear error when the chosen track has no baseUrl", async () => {
    // Hand-build the player JSON so the track is missing baseUrl entirely,
    // which the type-only cast would otherwise let through to safeFetch.
    const playerJson = JSON.stringify({
      videoDetails: { title: "T" },
      captions: {
        playerCaptionsTracklistRenderer: {
          captionTracks: [{ languageCode: "en" }],
        },
      },
    });
    mockFetch.mockImplementation(() =>
      Promise.resolve(firecrawlEnvelope(watchPageHtml(playerJson))),
    );
    await expect(
      tool.execute({ url: VIDEO_ID }, ctx),
    ).rejects.toThrow("Selected caption track has no usable URL");
    // Only the page was fetched; we bailed before the caption request.
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test("does not crash on a non-string title and omits the heading", async () => {
    const playerJson = JSON.stringify({
      videoDetails: { title: { weird: true } },
      captions: {
        playerCaptionsTracklistRenderer: {
          captionTracks: [{ baseUrl: CAPTION_BASE_URL, languageCode: "en" }],
        },
      },
    });
    mockTwoCalls(watchPageHtml(playerJson), srv3Xml([{ text: "the cue" }]));
    const result = await tool.execute({ url: VIDEO_ID }, ctx);
    expect(result).toBe("the cue");
  });

  test("collapses interior newlines in the title into a single-line heading", async () => {
    const playerJson = buildPlayerResponse({
      title: "Line one\nLine two\tindented",
      tracks: [{ baseUrl: CAPTION_BASE_URL, languageCode: "en" }],
    });
    mockTwoCalls(watchPageHtml(playerJson), srv3Xml([{ text: "the cue" }]));
    const result = await tool.execute({ url: VIDEO_ID }, ctx);
    expect(result).toBe("# Line one Line two indented\n\nthe cue");
  });

  test("returns a well-formed string when MAX_LENGTH cuts mid-surrogate", async () => {
    // Fill exactly to the boundary with ASCII, then place an emoji (a surrogate
    // pair) straddling MAX_LENGTH so the naive slice would keep a lone high half.
    const cue = "x".repeat(49_999) + "😀".repeat(100);
    const playerJson = buildPlayerResponse({
      tracks: [{ baseUrl: CAPTION_BASE_URL, languageCode: "en" }],
    });
    mockTwoCalls(watchPageHtml(playerJson), srv3Xml([{ text: cue }]));
    const result = await tool.execute({ url: VIDEO_ID }, ctx);
    expect(result.isWellFormed()).toBe(true);
    const last = result.charCodeAt(result.length - 1);
    expect(last >= 0xd800 && last <= 0xdbff).toBe(false);
  });

  test("parses a JSON3 caption body returned in place of XML", async () => {
    const json3 = JSON.stringify({
      events: [
        { segs: [{ utf8: "first " }, { utf8: "line" }] },
        { segs: [{ utf8: "second line" }] },
      ],
    });
    const playerJson = buildPlayerResponse({
      title: "JSON3 video",
      tracks: [{ baseUrl: CAPTION_BASE_URL, languageCode: "en" }],
    });
    let call = 0;
    mockFetch.mockImplementation(() => {
      call++;
      if (call === 1) {
        return Promise.resolve(firecrawlEnvelope(watchPageHtml(playerJson)));
      }
      return Promise.resolve(
        new Response(json3, {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    });
    const result = await tool.execute({ url: VIDEO_ID }, ctx);
    expect(result).toBe("# JSON3 video\n\nfirst line\nsecond line");
  });
});

describe("youtube_transcript Firecrawl layer", () => {
  test("scrapes the watch page via Firecrawl with the API key and rawHtml format", async () => {
    const playerJson = buildPlayerResponse({
      title: "T",
      tracks: [{ baseUrl: CAPTION_BASE_URL, languageCode: "en" }],
    });
    mockTwoCalls(watchPageHtml(playerJson), srv3Xml([{ text: "cue" }]));
    await tool.execute({ url: VIDEO_ID }, ctx);

    const [calledUrl, init] = mockFetch.mock.calls[0]!;
    expect(String(calledUrl)).toBe("https://api.firecrawl.dev/v2/scrape");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-api-key");
    const sent = JSON.parse(String(init?.body));
    expect(sent.url).toContain(`watch?v=${VIDEO_ID}`);
    expect(sent.formats).toEqual(["rawHtml"]);
    expect(sent.proxy).toBe("auto");
    expect(sent.maxAge).toBe(0);
  });

  test("falls back to data.html when rawHtml is absent", async () => {
    const playerJson = buildPlayerResponse({
      title: "HTML fallback",
      tracks: [{ baseUrl: CAPTION_BASE_URL, languageCode: "en" }],
    });
    mockFetch.mockImplementation((input: RequestInfo | URL) => {
      const u = typeof input === "string" ? input : input.toString();
      if (u.includes("api.firecrawl.dev")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ success: true, data: { html: watchPageHtml(playerJson) } }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        );
      }
      return Promise.resolve(
        new Response(srv3Xml([{ text: "cue" }]), {
          status: 200,
          headers: { "content-type": "application/xml" },
        }),
      );
    });
    const result = await tool.execute({ url: VIDEO_ID }, ctx);
    expect(result).toBe("# HTML fallback\n\ncue");
  });

  test("throws when Firecrawl returns success=false", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ success: false, error: "blocked" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    await expect(tool.execute({ url: VIDEO_ID }, ctx)).rejects.toThrow(
      "Firecrawl scrape failed: blocked",
    );
  });

  test("throws when Firecrawl returns an empty page", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ success: true, data: { rawHtml: "" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    await expect(tool.execute({ url: VIDEO_ID }, ctx)).rejects.toThrow(
      "Firecrawl returned an empty page",
    );
  });

  test("surfaces a non-2xx Firecrawl response as an error", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        new Response("rate limited", { status: 429, statusText: "Too Many Requests" }),
      ),
    );
    await expect(tool.execute({ url: VIDEO_ID }, ctx)).rejects.toThrow("Firecrawl error 429");
  });
});
