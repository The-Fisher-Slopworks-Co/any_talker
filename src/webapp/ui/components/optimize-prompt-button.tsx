// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useEffect, useState } from "react";
import { useI18n } from "../i18n-context";
import { api } from "../api-client";
import { fillOptimizationTemplate } from "../../../shared/prompt-optimization";
import { ActionRow } from "./controls";
import { SectionFooter } from "./layout";

type Optimize = {
  ready: boolean;
  status: "idle" | "copied" | "failed";
  copy: () => void;
};

// Copies a request for trimming `prompt` against the system prompt, to be run
// in an outside chat (claude.ai or similar) — the bot itself calls no model.
// The template is fetched up front so the click only fills and copies it.
export function useOptimizePrompt(prompt: string): Optimize {
  const [template, setTemplate] = useState<string | null>(null);
  const [status, setStatus] = useState<Optimize["status"]>("idle");

  useEffect(() => {
    api
      .getPromptOptimizationTemplate()
      .then((r) => setTemplate(r.template))
      .catch(() => setTemplate(null));
  }, []);

  // A later edit makes the copied text stale.
  useEffect(() => setStatus("idle"), [prompt]);

  return {
    ready: template !== null && prompt.trim() !== "",
    status,
    copy: () => {
      if (template === null) return;
      const text = fillOptimizationTemplate(template, prompt);
      void navigator.clipboard
        ?.writeText(text)
        .then(() => setStatus("copied"))
        .catch(() => setStatus("failed"));
    },
  };
}

// The action itself, a row for the card holding the prompt.
export function OptimizePromptRow({ optimize }: { optimize: Optimize }) {
  const { t: s } = useI18n();
  return (
    <ActionRow disabled={!optimize.ready} onClick={optimize.copy}>
      {optimize.status === "copied"
        ? s.ui_prompt_optimize_copied
        : s.ui_prompt_optimize_copy}
    </ActionRow>
  );
}

// `autosaves`: the screen has no Save button, so the instruction ends without it.
export function OptimizePromptFooter({
  optimize,
  autosaves,
}: {
  optimize: Optimize;
  autosaves?: boolean;
}) {
  const { t: s } = useI18n();
  return (
    <SectionFooter>
      {optimize.status === "failed"
        ? s.ui_prompt_optimize_failed
        : autosaves
          ? s.ui_prompt_optimize_autosave_footer
          : s.ui_prompt_optimize_footer}
    </SectionFooter>
  );
}
