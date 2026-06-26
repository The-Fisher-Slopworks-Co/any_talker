// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useEffect, useId, useState } from "react";
import { useI18n } from "../i18n-context";
import {
  fetchModelCatalog,
  formatPricePerMillion,
  lookupModel,
  supportsTools,
  type ModelInfo as CatalogModel,
} from "../model-catalog";
import { Card } from "./layout";
import { INPUT_LEFT_CLS } from "./row";

function ModelInfo({ model }: { model: CatalogModel | undefined }) {
  const { t: s } = useI18n();

  if (model === undefined)
    return <span className="text-tg-hint">{s.ui_modelinfo_loading}</span>;

  const inputPrice = formatPricePerMillion(model.pricing?.promptPerToken);
  const outputPrice = formatPricePerMillion(model.pricing?.completionPerToken);
  const imagePrice = formatPricePerMillion(model.pricing?.imagePerToken);
  const modalities = model.capabilities?.modalities ?? [];
  const hasTools = model.capabilities?.tools !== undefined;

  return (
    <div className="flex flex-col gap-1">
      <div className="font-medium text-tg-text">{model.name ?? model.id}</div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {inputPrice && (
          <span>
            <span className="text-tg-hint">{s.ui_modelinfo_input}</span>{" "}
            {inputPrice}
          </span>
        )}
        {outputPrice && (
          <span>
            <span className="text-tg-hint">{s.ui_modelinfo_output}</span>{" "}
            {outputPrice}
          </span>
        )}
        {imagePrice && (
          <span>
            <span className="text-tg-hint">{s.ui_modelinfo_image}</span>{" "}
            {imagePrice}
          </span>
        )}
      </div>
      {modalities.length > 0 && (
        <div>
          <span className="text-tg-hint">{s.ui_modelinfo_modalities}</span>{" "}
          {modalities.join(", ")}
        </div>
      )}
      {hasTools && (
        <div className="flex flex-wrap gap-x-3">
          <span>
            <span className="text-tg-hint">{s.ui_modelinfo_tools}</span>{" "}
            {supportsTools(model) ? s.ui_yes : s.ui_no}
          </span>
        </div>
      )}
    </div>
  );
}

// A generic OpenAI-compatible endpoint has no server-side fallback chain, so the
// picker edits a single model id. The value is still stored as a `string[]` (the
// `Settings.models` shape) holding that one entry.
//
// Catalogue ids feed a native <datalist> for autocomplete, and a typed id that a
// non-empty catalogue doesn't know is flagged invalid. Validity is reported via
// `onValidityChange` so the parent can disable its Save button; the server
// re-checks on write. Both layers stay quiet while the catalogue is loading or
// when the endpoint exposes no list, so saves are never blocked without a list.
export function ModelsCard({
  models,
  onChange,
  onValidityChange,
}: {
  models: string[];
  onChange: (next: string[]) => void;
  onValidityChange?: (valid: boolean) => void;
}) {
  const { t: s } = useI18n();
  const listId = useId();
  const [catalog, setCatalog] = useState<Map<string, CatalogModel> | null>(
    null,
  );

  useEffect(() => {
    fetchModelCatalog()
      .then(setCatalog)
      .catch(() => setCatalog(new Map()));
  }, []);

  const value = models[0] ?? "";
  const trimmed = value.trim();
  // Only a populated catalogue can declare a model unknown. While loading (null)
  // or when the endpoint exposes no catalogue (empty) we don't validate.
  const canValidate = catalog !== null && catalog.size > 0;
  const matched = canValidate ? lookupModel(catalog, trimmed) : null;
  const invalid = trimmed.length > 0 && canValidate && matched === null;

  // An empty field is the parent's own "required" concern, never invalid here.
  const valid = !invalid;
  useEffect(() => {
    onValidityChange?.(valid);
  }, [valid, onValidityChange]);

  const options = catalog ? [...catalog.keys()] : [];

  return (
    <Card>
      <div className="row relative flex flex-col gap-2 px-4 py-[11px]">
        <input
          className={INPUT_LEFT_CLS}
          value={value}
          onChange={(e) => onChange([e.target.value])}
          placeholder={s.ui_models_model_id}
          list={options.length > 0 ? listId : undefined}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        {options.length > 0 && (
          <datalist id={listId}>
            {options.map((id) => (
              <option key={id} value={id} />
            ))}
          </datalist>
        )}
        {trimmed.length > 0 &&
          (invalid ? (
            <div className="text-[13px] leading-[1.45] text-tg-destructive">
              {s.ui_models_not_in_catalog}
            </div>
          ) : catalog === null ? (
            <div className="text-[13px] leading-[1.45]">
              <ModelInfo model={undefined} />
            </div>
          ) : canValidate ? (
            <div className="text-[13px] leading-[1.45]">
              {/* Reaching here implies matched !== null; coalesce for the type. */}
              <ModelInfo model={matched ?? undefined} />
            </div>
          ) : null)}
      </div>
    </Card>
  );
}
