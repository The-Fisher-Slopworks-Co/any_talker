// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { fetchWithTimeout } from "../ai/tools/http";
import type { Storage } from "../storage/types";

const TELEGRAM_TIMEOUT_MS = 10_000;

export type PhotoSizeLike = {
  file_id: string;
  width: number;
  height: number;
};

const MAX_AREA = 1280 * 1280;

export function pickPhotoSize<T extends PhotoSizeLike>(sizes: readonly T[]): T | null {
  if (sizes.length === 0) return null;

  const sorted = [...sizes].sort(
    (a, b) => a.width * a.height - b.width * b.height,
  );

  let best: T | null = null;
  for (const s of sorted) {
    if (s.width * s.height <= MAX_AREA) best = s;
  }
  return best ?? sorted[0]!;
}

export async function downloadTelegramFile(
  botToken: string,
  fileId: string,
): Promise<Uint8Array> {
  const fileRes = await fetchWithTimeout(
    `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`,
    {},
    TELEGRAM_TIMEOUT_MS,
    "Telegram getFile",
  );
  const fileJson = (await fileRes.json()) as {
    ok: boolean;
    description?: string;
    result?: { file_path?: string };
  };
  if (!fileJson.ok || !fileJson.result?.file_path) {
    throw new Error(`getFile failed: ${fileJson.description ?? "unknown"}`);
  }
  const dlRes = await fetchWithTimeout(
    `https://api.telegram.org/file/bot${botToken}/${fileJson.result.file_path}`,
    {},
    TELEGRAM_TIMEOUT_MS,
    "Telegram file download",
  );
  if (!dlRes.ok) {
    throw new Error(`file download failed: HTTP ${dlRes.status}`);
  }
  return new Uint8Array(await dlRes.arrayBuffer());
}

export async function fetchTelegramPhoto(args: {
  storage: Storage;
  botToken: string;
  fileId: string;
}): Promise<Uint8Array> {
  const cached = await args.storage.getPhotoBytes(args.fileId).catch((err) => {
    console.error("photo cache read failed:", err);
    return null;
  });
  if (cached) return cached;
  const bytes = await downloadTelegramFile(args.botToken, args.fileId);
  args.storage.savePhotoBytes(args.fileId, bytes).catch((err) => {
    console.error("photo cache write failed:", err);
  });
  return bytes;
}
