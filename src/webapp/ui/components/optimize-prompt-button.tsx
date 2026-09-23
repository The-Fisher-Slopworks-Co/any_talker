// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useEffect, useState } from "react";
import { useI18n } from "../i18n-context";
import { api } from "../api-client";
import { fillOptimizationTemplate } from "../../../shared/prompt-optimization";
import { RowButton } from "./controls";
import { Card, SectionFooter } from "./layout";

// Copies a request for trimming `prompt` against the system prompt, to be run
// in an outside chat (claude.ai or similar) — the bot itself calls no model.
// The template is fetched up front so the click only fills and copies it.
export function OptimizePromptButton({ prompt }: { prompt: string }) {
  const { t: s } = useI18n();
  const [template, setTemplate] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    api
      .getPromptOptimizationTemplate()
      .then((r) => setTemplate(r.template))
      .catch(() => setTemplate(null));
  }, []);

  // A later edit makes the copied text stale.
  useEffect(() => setStatus("idle"), [prompt]);

  const copy = () => {
    if (template === null) return;
    const text = fillOptimizationTemplate(template, prompt);
    void navigator.clipboard
      ?.writeText(text)
      .then(() => setStatus("copied"))
      .catch(() => setStatus("failed"));
  };

  return (
    <>
      <Card>
        <RowButton
          disabled={template === null || prompt.trim() === ""}
          onClick={copy}
        >
          {status === "copied"
            ? s.ui_prompt_optimize_copied
            : s.ui_prompt_optimize_copy}
        </RowButton>
      </Card>
      <SectionFooter>
        {status === "failed"
          ? s.ui_prompt_optimize_failed
          : s.ui_prompt_optimize_footer}
      </SectionFooter>
    </>
  );
}
