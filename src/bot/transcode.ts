// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// Telegram voice notes are ogg/opus, but the OpenAI-compatible `input_audio`
// body field accepts only wav/mp3 — the provider throws on anything else. This
// transcodes ogg → mp3 via the host ffmpeg, streaming through pipes (no temp
// files). On any failure it returns null and the caller drops the audio part
// (sending the original ogg would make the provider throw and fail the ask).

// The mp3 media type the transcoded bytes carry downstream. Must be one of the
// formats the openai-compatible provider maps to `input_audio` (wav | mp3).
export const TRANSCODED_AUDIO_MEDIA_TYPE = "audio/mp3";

const TRANSCODE_TIMEOUT_MS = 15_000;

// The slice of `Bun.spawn` this module uses, narrowed so tests can inject a fake
// subprocess without constructing a real one.
type SpawnedProcess = {
  stdout: ReadableStream<Uint8Array>;
  exited: Promise<number>;
};
export type SpawnFn = (
  cmd: string[],
  opts: {
    stdin: Uint8Array;
    stdout: "pipe";
    stderr: "ignore";
    signal: AbortSignal;
  },
) => SpawnedProcess;

const defaultSpawn: SpawnFn = (cmd, opts) =>
  Bun.spawn(cmd, opts) as unknown as SpawnedProcess;

export async function transcodeOggToMp3(
  input: Uint8Array,
  spawn: SpawnFn = defaultSpawn,
): Promise<Uint8Array | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRANSCODE_TIMEOUT_MS);
  try {
    const proc = spawn(
      [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        "pipe:0",
        "-f",
        "mp3",
        "-c:a",
        "libmp3lame",
        "-q:a",
        "4",
        "pipe:1",
      ],
      { stdin: input, stdout: "pipe", stderr: "ignore", signal: controller.signal },
    );
    const [bytes, code] = await Promise.all([
      new Response(proc.stdout).arrayBuffer(),
      proc.exited,
    ]);
    if (code !== 0) return null;
    const out = new Uint8Array(bytes);
    return out.byteLength > 0 ? out : null;
  } catch {
    // ffmpeg missing (ENOENT), aborted on timeout, or stream error: the caller
    // drops the audio rather than risk crashing the request with raw ogg.
    return null;
  } finally {
    clearTimeout(timer);
  }
}
