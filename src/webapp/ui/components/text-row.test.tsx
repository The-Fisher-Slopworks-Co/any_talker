// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { AreaRow, TextRow } from "./text-row";

function props(over: Partial<Parameters<typeof TextRow>[0]> = {}) {
  return {
    label: "Bot Name",
    placeholder: "Off",
    value: "",
    onChange: () => {},
    onCommit: () => {},
    ...over,
  };
}

test("shows the label, the value and the placeholder of a text row", () => {
  const html = renderToStaticMarkup(<TextRow {...props({ maxLength: 64 })} />);
  expect(html).toContain(">Bot Name</span>");
  expect(html).toContain('placeholder="Off"');
  expect(html).toContain('maxLength="64"');
});

test("an area row is a labelled textarea that does not resize", () => {
  const html = renderToStaticMarkup(
    <AreaRow
      label="Keyword Filter"
      placeholder="word1"
      value="spam"
      onChange={() => {}}
      onCommit={() => {}}
    />,
  );
  expect(html).toContain('aria-label="Keyword Filter"');
  expect(html).toContain("resize-none");
  expect(html).toContain(">spam</textarea>");
});

type InputProps = { onChange: (e: unknown) => void; onBlur: () => void };

// Typing into the field and taking the screen away needs a DOM. linkedom does
// not feed React's event plumbing, so the handlers React attached to the input
// are called directly, as its event system would.
describe("committing", () => {
  const { window, document } = parseHTML(
    "<!doctype html><html><body></body></html>",
  );
  Object.assign(globalThis, { window, document });
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

  function Harness({ onCommit }: { onCommit: () => void }) {
    const [value, setValue] = useState("");
    return <TextRow {...props({ value, onChange: setValue, onCommit })} />;
  }

  async function mountTyped(onCommit: () => void) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(<Harness onCommit={onCommit} />));
    const input = container.querySelector("input")!;
    const key = Object.keys(input).find((k) => k.startsWith("__reactProps"))!;
    const handlers = (input as unknown as Record<string, InputProps>)[key]!;
    await act(async () => handlers.onChange({ target: { value: "Rex" } }));
    return { root, handlers };
  }

  test("commits typed text that is still pending when the row goes away", async () => {
    let commits = 0;
    const { root } = await mountTyped(() => commits++);
    expect(commits).toBe(0);
    await act(async () => root.unmount());
    expect(commits).toBe(1);
  });

  test("does not commit again on unmount once the field was left", async () => {
    let commits = 0;
    const { root, handlers } = await mountTyped(() => commits++);
    await act(async () => handlers.onBlur());
    expect(commits).toBe(1);
    await act(async () => root.unmount());
    expect(commits).toBe(1);
  });

  test("an area row commits pending text on unmount too", async () => {
    let commits = 0;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    function Area() {
      const [value, setValue] = useState("");
      return (
        <AreaRow
          label="Words"
          placeholder=""
          value={value}
          onChange={setValue}
          onCommit={() => commits++}
        />
      );
    }
    await act(async () => root.render(<Area />));
    const area = container.querySelector("textarea")!;
    const key = Object.keys(area).find((k) => k.startsWith("__reactProps"))!;
    const handlers = (area as unknown as Record<string, InputProps>)[key]!;
    await act(async () => handlers.onChange({ target: { value: "spam" } }));
    await act(async () => root.unmount());
    expect(commits).toBe(1);
  });
});
