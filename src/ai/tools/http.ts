import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
  timeoutLabel: string,
): Promise<Response> {
  try {
    return await fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new Error(`${timeoutLabel} timed out after ${timeoutMs / 1000}s`);
    }
    throw err;
  }
}

const PRIVATE_BLOCK_MESSAGE = "Blocked: private and local addresses are not allowed";

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts as [number, number, number, number];
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const noZone = ip.split("%")[0]?.toLowerCase() ?? "";
  if (noZone === "::1" || noZone === "::") return true;

  const dotted = noZone.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (dotted && isIP(dotted[1]!) === 4) return isPrivateIPv4(dotted[1]!);

  const hex = noZone.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = Number.parseInt(hex[1]!, 16);
    const lo = Number.parseInt(hex[2]!, 16);
    if (hi >= 0 && hi <= 0xffff && lo >= 0 && lo <= 0xffff) {
      const v4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
      return isPrivateIPv4(v4);
    }
  }

  if (/^f[cd][0-9a-f]{2}:/.test(noZone)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(noZone)) return true;
  if (/^ff[0-9a-f]{2}:/.test(noZone)) return true;
  return false;
}

export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return isPrivateIPv4(ip);
  if (v === 6) return isPrivateIPv6(ip);
  return true;
}

function stripIPv6Brackets(host: string): string {
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
}

export async function assertPublicHost(hostname: string): Promise<void> {
  const bare = stripIPv6Brackets(hostname);
  if (bare === "" || bare.toLowerCase() === "localhost") {
    throw new Error(PRIVATE_BLOCK_MESSAGE);
  }
  if (isIP(bare)) {
    if (isPrivateAddress(bare)) {
      throw new Error(PRIVATE_BLOCK_MESSAGE);
    }
    return;
  }
  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(bare, { all: true, verbatim: true });
  } catch {
    throw new Error(PRIVATE_BLOCK_MESSAGE);
  }
  if (addresses.length === 0) {
    throw new Error(PRIVATE_BLOCK_MESSAGE);
  }
  for (const { address } of addresses) {
    if (isPrivateAddress(address)) {
      throw new Error(PRIVATE_BLOCK_MESSAGE);
    }
  }
}

export type SafeFetchOptions = {
  init: RequestInit;
  timeoutMs: number;
  timeoutLabel: string;
  maxRedirects?: number;
};

export async function safeFetch(url: string, opts: SafeFetchOptions): Promise<Response> {
  const maxRedirects = opts.maxRedirects ?? 5;
  let currentUrl = url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const parsed = new URL(currentUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(`Blocked: protocol ${parsed.protocol} is not allowed`);
    }
    await assertPublicHost(parsed.hostname);

    const response = await fetchWithTimeout(
      currentUrl,
      { ...opts.init, redirect: "manual" },
      opts.timeoutMs,
      opts.timeoutLabel,
    );

    if (response.status >= 300 && response.status < 400 && response.status !== 304) {
      const location = response.headers.get("location");
      if (!location) return response;
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }
    return response;
  }
  throw new Error(`Too many redirects (>${maxRedirects})`);
}

export async function readBodyCapped(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error(`Response too large (${declared} bytes)`);
  }
  const reader = response.body?.getReader();
  if (!reader) {
    return new Uint8Array(0);
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new Error(`Response too large (>${maxBytes} bytes)`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export async function readTextCapped(response: Response, maxBytes: number): Promise<string> {
  const buf = await readBodyCapped(response, maxBytes);
  return new TextDecoder().decode(buf);
}
