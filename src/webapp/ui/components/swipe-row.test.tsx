// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SwipeToDelete } from "./swipe-row";

test("renders the row over a hidden, labelled red action", () => {
  const html = renderToStaticMarkup(
    <SwipeToDelete label="Remove" onDelete={() => {}}>
      <span>Sam</span>
    </SwipeToDelete>,
  );
  expect(html).toContain("<span>Sam</span>");
  expect(html).toContain(">Remove</button>");
  expect(html).toContain("bg-tg-destructive");
  // Closed: the action is invisible, so also out of the tab order and the
  // accessibility tree; the row's own detail screen is the keyboard path.
  expect(html).toContain("invisible");
  // Vertical drags stay with the page's scroll.
  expect(html).toContain("touch-pan-y");
  expect(html).toContain("translateX(0px)");
});

// The hairline between rows is drawn by CSS on sibling combinators, so the
// roots of consecutive swipe rows must be direct siblings, and the stylesheet
// must name every pairing a card can hold: swipe rows next to each other, to
// a plain row, and to an action row such as the "add" row ending a list.
test("consecutive swipe rows and their neighbours get a separator", async () => {
  const html = renderToStaticMarkup(
    <div>
      <SwipeToDelete label="Remove" onDelete={() => {}}>
        <div className="row row-avatar">A</div>
      </SwipeToDelete>
      <SwipeToDelete label="Remove" onDelete={() => {}}>
        <div className="row row-avatar">B</div>
      </SwipeToDelete>
      <div className="row action-row">Add</div>
    </div>,
  );
  expect(html.match(/class="swipe-row /g)).toHaveLength(2);
  expect(html).toMatch(/<\/div><div[^>]*class="swipe-row /);
  expect(html).toContain('</div></div><div class="row action-row">');

  const css = await Bun.file(new URL("../styles.css", import.meta.url)).text();
  for (const pair of [
    ".swipe-row + .swipe-row::before",
    ".row + .swipe-row::before",
    ".swipe-row + .row::before",
    ".swipe-row + .action-row::before",
    // Past the avatar when the row has one.
    ".swipe-row:has(.row-avatar)::before",
  ]) {
    expect(css).toContain(pair);
  }
});
