function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

// `{name}` and `{count}` are replaced with HTML-safe values; the rest of
// the template is HTML-escaped so plain-text input from the owner can
// be sent with parse_mode=HTML without breaking the parser.
export function formatTemplate(
  template: string,
  vars: { targetUserId: string; name: string; count: number },
): string {
  const nonce = crypto.randomUUID();
  const nameSentinel = `xN${nonce}x`;
  const countSentinel = `xC${nonce}x`;

  const nameHtml = `<a href="tg://user?id=${escapeAttr(vars.targetUserId)}">${escapeHtml(vars.name)}</a>`;
  const countHtml = escapeHtml(String(vars.count));

  return escapeHtml(
    template
      .replaceAll("{name}", nameSentinel)
      .replaceAll("{count}", countSentinel),
  )
    .replaceAll(nameSentinel, nameHtml)
    .replaceAll(countSentinel, countHtml);
}
