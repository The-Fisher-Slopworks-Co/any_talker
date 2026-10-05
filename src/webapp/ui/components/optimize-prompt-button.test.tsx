// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe, spyOn } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { api } from "../api-client";
import { I18nProvider } from "../i18n-context";
import {
  OptimizePromptFooter,
  useOptimizePrompt,
} from "./optimize-prompt-button";

describe("useOptimizePrompt", () => {
  test("a prompt screen opened again is ready from its first frame", async () => {
    const { window, document } = parseHTML(
      "<!doctype html><html><body></body></html>",
    );
    Object.assign(globalThis, { window, document });
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const spy = spyOn(api, "getPromptOptimizationTemplate").mockResolvedValue({
      template: "T",
    });
    const frames: boolean[] = [];
    function Probe() {
      frames.push(useOptimizePrompt("prompt").ready);
      return null;
    }
    const mount = async () => {
      const root = createRoot(document.createElement("div"));
      await act(async () => root.render(<Probe />));
      await act(async () => root.unmount());
    };
    try {
      await mount();
      expect(frames).toEqual([false, true]);
      frames.length = 0;
      await mount();
      expect(frames[0]).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("OptimizePromptFooter", () => {
  // Every prompt screen autosaves, so the instruction never mentions saving.
  test("tells the admin to paste the shortened prompt back, without saving", () => {
    const html = renderToStaticMarkup(
      <I18nProvider lang="en">
        <OptimizePromptFooter
          optimize={{ ready: true, status: "idle", copy: () => {} }}
        />
      </I18nProvider>,
    );
    expect(html).toContain("paste the shortened prompt back here.");
    expect(html).not.toContain("save");
  });

  test("opens with the screen's own sentence in the same paragraph", () => {
    const html = renderToStaticMarkup(
      <I18nProvider lang="en">
        <OptimizePromptFooter
          optimize={{ ready: true, status: "idle", copy: () => {} }}
          lead="Replaces the global prompt."
        />
      </I18nProvider>,
    );
    expect(html).toContain("Replaces the global prompt. Copies a request");
    expect(html.match(/<div/g)).toHaveLength(1);
  });

  test("reports a clipboard failure instead", () => {
    const html = renderToStaticMarkup(
      <I18nProvider lang="en">
        <OptimizePromptFooter
          optimize={{ ready: true, status: "failed", copy: () => {} }}
        />
      </I18nProvider>,
    );
    expect(html).toContain("Could not copy to the clipboard.");
  });
});
