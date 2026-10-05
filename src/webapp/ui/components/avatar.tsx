// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// Telegram's seven peer colours (red, orange, violet, green, cyan, blue,
// pink) as top-to-bottom gradients, in Telegram's own order: a peer's colour
// is its id modulo 7, so a chat looks the same here as in the Telegram app.
const PEER_GRADIENTS = [
  ["#ff885e", "#ff516a"],
  ["#ffcd6a", "#ffa85c"],
  ["#82b1ff", "#665fff"],
  ["#a0de7e", "#54cb68"],
  ["#53edd6", "#28c9b7"],
  ["#72d5fd", "#2a9ef1"],
  ["#e0a2f3", "#d669ed"],
] as const;

// Telegram counts with the bare peer id, but the Bot API ids kept here are
// signed: a group is "-id" and a supergroup or channel "-100id". Undo that
// before taking the remainder (BigInt: the ids exceed 32 bits). Anything that
// is not an integer id still gets a stable colour.
export function peerColorIndex(id: string): number {
  const bare = id.replace(/^-100(?=\d{10}$)/, "").replace(/^-/, "");
  try {
    return Number(BigInt(bare) % 7n);
  } catch {
    return 0;
  }
}

// The first letter of each of the first two words; words that open with
// punctuation or an emoji ("@handle", "🔥 Club") use their first letter.
export function avatarInitials(name: string): string {
  const letters = name
    .split(/\s+/)
    .map((word) => word.match(/[\p{L}\p{N}]/u)?.[0])
    .filter((letter) => letter !== undefined)
    .slice(0, 2);
  return letters.length > 0 ? letters.join("").toUpperCase() : "?";
}

const SIZE_CLS = {
  row: "h-9 w-9 text-[15px]",
  hero: "h-[84px] w-[84px] text-[34px]",
} as const;

export function Avatar({
  id,
  name,
  size = "row",
}: {
  id: string;
  name: string;
  size?: keyof typeof SIZE_CLS;
}) {
  const [top, bottom] = PEER_GRADIENTS[peerColorIndex(id)]!;
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full font-semibold text-white ${SIZE_CLS[size]}`}
      style={{ backgroundImage: `linear-gradient(${top}, ${bottom})` }}
    >
      {avatarInitials(name)}
    </span>
  );
}
