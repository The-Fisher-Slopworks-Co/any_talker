export const CHECK_CALLBACK_RE = /^check:([^:]+):(yes|no)$/;

export function buildCheckCallback(
  id: string,
  answer: "yes" | "no",
): string {
  return `check:${id}:${answer}`;
}
