// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useState } from "react";
import { api } from "../api-client";
import type { SettingsPatch } from "../api-client/settings";
import { LIMIT_CLASSES, type Settings } from "../../../shared/types";
import { useAutosave, type SaveStatus } from "./use-autosave";

// `source`'s values for the fields `shape` names.
function pick<T>(source: T, shape: Partial<T>): Partial<T> {
  return Object.fromEntries(
    Object.keys(shape).map((key) => [key, source[key as keyof T]]),
  ) as Partial<T>;
}

// `base` with `patch` laid over it, merged exactly as the server merges it:
// the grouped settings field by field, `limitClasses` per class and field, and
// everything else (a nullable `limitBoost` included) replaced whole.
export function applyPatch(base: Settings, patch: SettingsPatch): Settings {
  const { rateLimit, reasoningEffort, budget, anomaly, limitClasses, ...rest } =
    patch;
  const classes = { ...base.limitClasses };
  for (const c of LIMIT_CLASSES)
    classes[c] = { ...base.limitClasses[c], ...limitClasses?.[c] };
  return {
    ...base,
    ...rest,
    rateLimit: { ...base.rateLimit, ...rateLimit },
    reasoningEffort: { ...base.reasoningEffort, ...reasoningEffort },
    budget: { ...base.budget, ...budget },
    anomaly: { ...base.anomaly, ...anomaly },
    limitClasses: classes,
  };
}

// `draft` after `patch` was rejected: the fields it named go back to their
// `saved` values and everything else keeps the edits made since.
export function revertPatch(
  draft: Settings,
  saved: Settings,
  patch: SettingsPatch,
): Settings {
  const { rateLimit, reasoningEffort, budget, anomaly, limitClasses, ...rest } =
    patch;
  const classes: NonNullable<SettingsPatch["limitClasses"]> = {};
  for (const c of LIMIT_CLASSES) {
    const named = limitClasses?.[c];
    if (named) classes[c] = pick(saved.limitClasses[c], named);
  }
  return applyPatch(draft, {
    ...pick(saved, rest),
    rateLimit: pick(saved.rateLimit, rateLimit ?? {}),
    reasoningEffort: pick(saved.reasoningEffort, reasoningEffort ?? {}),
    budget: pick(saved.budget, budget ?? {}),
    anomaly: pick(saved.anomaly, anomaly ?? {}),
    limitClasses: classes,
  });
}

// Autosave for the admin's global-settings screens. `draft` is what the form
// shows: every `save(patch)` lands there at once and is sent as its own partial
// `PUT /api/settings`, in order. A rejected patch puts just its fields back to
// the last saved values (`settings`) and `status` becomes "failed". The server's
// replies only feed `onSaved` while patches are in flight, so a slow answer
// cannot undo a newer edit; once the queue has drained the draft is reset to the
// `settings` the parent holds (the last reply, the server's own state), which
// also picks up any change made outside this form and any edit left showing
// after an earlier patch failed.
export function useSettingsAutosave({
  settings,
  onSaved,
}: {
  settings: Settings;
  onSaved: (settings: Settings) => void;
}): {
  draft: Settings;
  save: (patch: SettingsPatch) => void;
  status: SaveStatus;
} {
  const [draft, setDraft] = useState(settings);
  const { save, status } = useAutosave<SettingsPatch, Settings>({
    send: api.putSettings,
    onSaved,
    onFailed: (patch) => setDraft((d) => revertPatch(d, settings, patch)),
  });
  const [seen, setSeen] = useState(settings);
  if (settings !== seen && status !== "saving") {
    setSeen(settings);
    setDraft(settings);
  }
  return {
    draft,
    status,
    save: (patch) => {
      setDraft((d) => applyPatch(d, patch));
      save(patch);
    },
  };
}
