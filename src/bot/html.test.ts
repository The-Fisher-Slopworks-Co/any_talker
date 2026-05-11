import { test, expect, describe } from "bun:test";
import { sanitizeHtml, escapeHtmlText } from "./html";

describe("escapeHtmlText", () => {
  test("escapes &, <, >", () => {
    expect(escapeHtmlText("a & b < c > d")).toBe("a &amp; b &lt; c &gt; d");
  });
  test("does not escape quotes", () => {
    expect(escapeHtmlText('"hi"')).toBe('"hi"');
  });
});

describe("sanitizeHtml", () => {
  test("plain text without tags or specials passes through", () => {
    expect(sanitizeHtml("hello world")).toBe("hello world");
  });

  test("escapes bare < and > in text", () => {
    expect(sanitizeHtml("a < b and c > d")).toBe(
      "a &lt; b and c &gt; d",
    );
  });

  test("preserves valid named entities", () => {
    expect(sanitizeHtml("&lt;tag&gt; &amp; &quot;x&quot;")).toBe(
      "&lt;tag&gt; &amp; &quot;x&quot;",
    );
  });

  test("preserves numeric entities (decimal and hex)", () => {
    expect(sanitizeHtml("&#1234; &#x1F600;")).toBe("&#1234; &#x1F600;");
  });

  test("escapes unknown named entities", () => {
    expect(sanitizeHtml("&copy;")).toBe("&amp;copy;");
  });

  test("escapes a lone & not part of an entity", () => {
    expect(sanitizeHtml("Tom & Jerry")).toBe("Tom &amp; Jerry");
  });

  test("preserves allowed simple tags", () => {
    expect(sanitizeHtml("<b>bold</b> <i>i</i> <u>u</u>")).toBe(
      "<b>bold</b> <i>i</i> <u>u</u>",
    );
  });

  test("lowercases tag names", () => {
    expect(sanitizeHtml("<B>x</B>")).toBe("<b>x</b>");
  });

  test("strips disallowed tags by escaping", () => {
    expect(sanitizeHtml("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;",
    );
  });

  test("strips attributes from simple tags", () => {
    expect(sanitizeHtml('<b class="x" id="y">bold</b>')).toBe("<b>bold</b>");
  });

  test("preserves <a href> with http(s) scheme", () => {
    expect(sanitizeHtml('<a href="https://example.com">link</a>')).toBe(
      '<a href="https://example.com">link</a>',
    );
  });

  test("preserves <a href> with tg:// scheme", () => {
    expect(sanitizeHtml('<a href="tg://user?id=42">u</a>')).toBe(
      '<a href="tg://user?id=42">u</a>',
    );
  });

  test("rejects <a href> with javascript: scheme", () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).toBe(
      '&lt;a href="javascript:alert(1)"&gt;x&lt;/a&gt;',
    );
  });

  test("rejects <a> without href", () => {
    expect(sanitizeHtml("<a>no href</a>")).toBe("&lt;a&gt;no href&lt;/a&gt;");
  });

  test("escapes & inside href attribute value", () => {
    expect(
      sanitizeHtml('<a href="https://x.com/?a=1&b=2">l</a>'),
    ).toBe('<a href="https://x.com/?a=1&amp;b=2">l</a>');
  });

  test("supports single-quoted href", () => {
    expect(sanitizeHtml("<a href='https://x.com'>l</a>")).toBe(
      '<a href="https://x.com">l</a>',
    );
  });

  test("preserves <pre><code class='language-python'>", () => {
    expect(
      sanitizeHtml(
        '<pre><code class="language-python">print(1)</code></pre>',
      ),
    ).toBe('<pre><code class="language-python">print(1)</code></pre>');
  });

  test("strips class on standalone <code> (only valid inside <pre>)", () => {
    expect(sanitizeHtml('<code class="language-python">x</code>')).toBe(
      "<code>x</code>",
    );
  });

  test("escapes <, >, & inside text between allowed tags", () => {
    expect(sanitizeHtml("<b>a < b & c > d</b>")).toBe(
      "<b>a &lt; b &amp; c &gt; d</b>",
    );
  });

  test("auto-closes unclosed tags at EOF in reverse order", () => {
    expect(sanitizeHtml("<b><i>hello")).toBe("<b><i>hello</i></b>");
  });

  test("escapes mismatched closing tag (no matching open)", () => {
    expect(sanitizeHtml("hello </b>")).toBe("hello &lt;/b&gt;");
  });

  test("escapes wrong-order close as text but keeps the rest balanced", () => {
    expect(sanitizeHtml("<b>x</i></b>")).toBe("<b>x&lt;/i&gt;</b>");
  });

  test("handles nested allowed tags", () => {
    expect(sanitizeHtml("<b>bold and <i>italic</i></b>")).toBe(
      "<b>bold and <i>italic</i></b>",
    );
  });

  test("rejects close tag with attributes (treats it as text)", () => {
    expect(sanitizeHtml("<b>x</b foo>")).toBe("<b>x&lt;/b foo&gt;</b>");
  });
});
