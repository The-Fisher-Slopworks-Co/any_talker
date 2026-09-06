// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// Telegram voice notes are ogg/opus, but OpenRouter's `input_audio` item
// accepts only wav/mp3 and throws on anything else. This transcodes ogg → mp3
// via the host ffmpeg, streaming through pipes (no temp files). On any failure
// it returns null and the caller drops the audio part (sending the original
// ogg would throw and fail the ask).

import { defaultFfmpegSpawn, runFfmpeg, type FfmpegSpawnFn } from "./ffmpeg";

// The mp3 media type the transcoded bytes carry downstream. Must stay one of
// the two formats an `input_audio` item accepts (wav | mp3).
export const TRANSCODED_AUDIO_MEDIA_TYPE = "audio/mp3";

const TRANSCODE_TIMEOUT_MS = 15_000;

// A null result — ffmpeg missing, timed out, or a non-zero exit — has the caller
// drop the audio rather than risk crashing the request with raw ogg.
export async function transcodeOggToMp3(
  input: Uint8Array,
  spawn: FfmpegSpawnFn = defaultFfmpegSpawn,
): Promise<Uint8Array | null> {
  return runFfmpeg(
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
    spawn,
    { stdin: input, timeoutMs: TRANSCODE_TIMEOUT_MS },
  );
}
