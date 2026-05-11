const ALLOWED_TAGS = new Set(["b", "i", "u", "a", "code", "pre"]);
const NAMED_ENTITIES = new Set(["lt", "gt", "amp", "quot"]);

export function escapeHtmlText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function sanitizeHtml(input: string): string {
  const out: string[] = [];
  const stack: string[] = [];
  let i = 0;
  const n = input.length;

  while (i < n) {
    const ch = input[i]!;
    if (ch === "<") {
      const tag = parseTag(input, i);
      if (tag === null) {
        out.push("&lt;");
        i++;
        continue;
      }
      if (!ALLOWED_TAGS.has(tag.name)) {
        out.push("&lt;");
        i++;
        continue;
      }
      if (tag.kind === "open") {
        const rendered = renderOpenTag(tag.name, tag.attrs, stack);
        if (rendered === null) {
          out.push("&lt;");
          i++;
          continue;
        }
        out.push(rendered);
        stack.push(tag.name);
        i = tag.end;
      } else {
        if (stack.length > 0 && stack[stack.length - 1] === tag.name) {
          out.push(`</${tag.name}>`);
          stack.pop();
          i = tag.end;
        } else {
          out.push("&lt;");
          i++;
        }
      }
    } else if (ch === "&") {
      const ent = parseEntity(input, i);
      if (ent !== null) {
        out.push(ent.raw);
        i = ent.end;
      } else {
        out.push("&amp;");
        i++;
      }
    } else if (ch === ">") {
      out.push("&gt;");
      i++;
    } else {
      out.push(ch);
      i++;
    }
  }

  while (stack.length > 0) {
    out.push(`</${stack.pop()!}>`);
  }

  return out.join("");
}

type TagToken = {
  kind: "open" | "close";
  name: string;
  attrs: string;
  end: number;
};

function parseTag(input: string, start: number): TagToken | null {
  if (input[start] !== "<") return null;
  let i = start + 1;
  let kind: "open" | "close" = "open";
  if (input[i] === "/") {
    kind = "close";
    i++;
  }
  const nameStart = i;
  while (i < input.length && /[a-zA-Z0-9]/.test(input[i]!)) i++;
  if (i === nameStart) return null;
  const name = input.slice(nameStart, i).toLowerCase();

  let attrsEnd = i;
  while (attrsEnd < input.length && input[attrsEnd] !== ">") attrsEnd++;
  if (input[attrsEnd] !== ">") return null;

  const rawAttrs = input.slice(i, attrsEnd);
  if (kind === "close" && rawAttrs.trim() !== "") return null;

  return { kind, name, attrs: rawAttrs, end: attrsEnd + 1 };
}

type Entity = { raw: string; end: number };

function parseEntity(input: string, start: number): Entity | null {
  if (input[start] !== "&") return null;
  let i = start + 1;
  if (input[i] === "#") {
    i++;
    const isHex = input[i] === "x" || input[i] === "X";
    if (isHex) i++;
    const numStart = i;
    const isDigit = isHex
      ? (c: string) => /[0-9a-fA-F]/.test(c)
      : (c: string) => /[0-9]/.test(c);
    while (i < input.length && isDigit(input[i]!)) i++;
    if (i === numStart || input[i] !== ";") return null;
    return { raw: input.slice(start, i + 1), end: i + 1 };
  }
  const nameStart = i;
  while (i < input.length && /[a-zA-Z]/.test(input[i]!)) i++;
  if (i === nameStart || input[i] !== ";") return null;
  const name = input.slice(nameStart, i);
  if (!NAMED_ENTITIES.has(name)) return null;
  return { raw: input.slice(start, i + 1), end: i + 1 };
}

function renderOpenTag(
  name: string,
  attrs: string,
  stack: string[],
): string | null {
  if (name === "b" || name === "i" || name === "u" || name === "pre") {
    return `<${name}>`;
  }
  if (name === "a") {
    const href = extractAttr(attrs, "href");
    if (href === null || !isSafeUrl(href)) return null;
    return `<a href="${escapeAttrValue(href)}">`;
  }
  if (name === "code") {
    const parent = stack[stack.length - 1];
    if (parent === "pre") {
      const cls = extractAttr(attrs, "class");
      if (cls !== null && /^language-[a-zA-Z0-9_+\-.]+$/.test(cls)) {
        return `<code class="${cls}">`;
      }
    }
    return "<code>";
  }
  return null;
}

function extractAttr(attrs: string, name: string): string | null {
  const re = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i");
  const m = attrs.match(re);
  if (!m) return null;
  return m[2] ?? m[3] ?? "";
}

function isSafeUrl(url: string): boolean {
  return /^(https?:\/\/|tg:\/\/)/i.test(url);
}

export function escapeAttrValue(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
