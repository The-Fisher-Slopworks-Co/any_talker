// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// The one place ffmpeg is actually run. Both callers — the voice transcode
// (`transcode.ts`) and the video frame/soundtrack passes (`video/decode.ts`) —
// want the same thing: spawn ffmpeg, read stdout whole, and treat anything that
// is not a clean exit carrying bytes as "this pass produced nothing". They
// differ only in the argv, how the input arrives (piped bytes vs a path ffmpeg
// opens itself) and how long the pass is allowed to take.

// The slice of a spawned subprocess this module touches, narrowed so tests can
// inject a fake without constructing a real one.
type SpawnedProcess = {
  stdout: ReadableStream<Uint8Array>;
  exited: Promise<number>;
};

// The slice of `Bun.spawn` the ffmpeg callers use. `stdin` is either the bytes
// to pipe in or "ignore" for a pass that reads its input from a path.
export type FfmpegSpawnFn = (
  cmd: string[],
  opts: {
    stdin: Uint8Array | "ignore";
    stdout: "pipe";
    stderr: "ignore";
    signal: AbortSignal;
  },
) => SpawnedProcess;

export const defaultFfmpegSpawn: FfmpegSpawnFn = (cmd, opts) =>
  Bun.spawn(cmd, opts) as unknown as SpawnedProcess;

export async function runFfmpeg(
  cmd: string[],
  spawn: FfmpegSpawnFn,
  opts: { stdin: Uint8Array | "ignore"; timeoutMs: number },
): Promise<Uint8Array | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const proc = spawn(cmd, {
      stdin: opts.stdin,
      stdout: "pipe",
      stderr: "ignore",
      signal: controller.signal,
    });
    const [bytes, code] = await Promise.all([
      new Response(proc.stdout).arrayBuffer(),
      proc.exited,
    ]);
    if (code !== 0) return null;
    const out = new Uint8Array(bytes);
    return out.byteLength > 0 ? out : null;
  } catch {
    // ffmpeg missing (ENOENT), aborted on timeout, or a stream error. Every
    // caller reads null as "this pass produced nothing" and carries on without
    // it rather than failing the request.
    return null;
  } finally {
    clearTimeout(timer);
  }
}
