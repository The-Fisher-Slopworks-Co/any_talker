function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

// Used for the initial question that gets posted at the scheduled time.
// `{name}` becomes a clickable tg://user mention so the user gets pinged;
// the rest of the template is HTML-escaped so plain-text input from the
// owner survives parse_mode=HTML.
export function formatQuestion(
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

// Used for the yes/no/timeout reply. Plain-text substitution — no HTML
// escaping, no mention link. The reply is sent without parse_mode so the
// text appears verbatim.
export function formatReply(
  template: string,
  vars: { name: string; count: number },
): string {
  return template
    .replaceAll("{name}", vars.name)
    .replaceAll("{count}", String(vars.count));
}
