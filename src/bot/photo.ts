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
  const fileRes = await fetch(
    `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`,
  );
  const fileJson = (await fileRes.json()) as {
    ok: boolean;
    description?: string;
    result?: { file_path?: string };
  };
  if (!fileJson.ok || !fileJson.result?.file_path) {
    throw new Error(`getFile failed: ${fileJson.description ?? "unknown"}`);
  }
  const dlRes = await fetch(
    `https://api.telegram.org/file/bot${botToken}/${fileJson.result.file_path}`,
  );
  if (!dlRes.ok) {
    throw new Error(`file download failed: HTTP ${dlRes.status}`);
  }
  return new Uint8Array(await dlRes.arrayBuffer());
}
