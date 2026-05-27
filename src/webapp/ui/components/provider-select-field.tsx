// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useEffect, useState } from "react";
import { useI18n } from "../i18n-context";
import {
  fetchOpenRouterEndpoints,
  toProviderOptions,
  type ProviderOption,
} from "../openrouter-models";
import { Card } from "./layout";
import { SelectChevron } from "./controls";
import { INPUT_CLS, ROW_CLS, ROW_LABEL_CLS } from "./row";

export function ProviderSelectField({
  modelId,
  value,
  onChange,
}: {
  modelId: string;
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  const { t: s } = useI18n();
  const [providers, setProviders] = useState<ProviderOption[] | null>(null);

  const trimmedModel = modelId.trim();

  useEffect(() => {
    if (trimmedModel.length === 0) {
      setProviders([]);
      return;
    }
    let cancelled = false;
    setProviders(null);
    fetchOpenRouterEndpoints(trimmedModel)
      .then((eps) => {
        if (!cancelled) setProviders(toProviderOptions(eps));
      })
      .catch(() => {
        if (!cancelled) setProviders([]);
      });
    return () => {
      cancelled = true;
    };
  }, [trimmedModel]);

  const loading = providers === null;
  const options = providers ?? [];
  // Keep a pinned slug selectable even when it isn't in the fetched list (model
  // changed, stale cache, slug-less endpoint) so switching never drops it.
  const known = options.some((o) => o.slug === value);
  const merged =
    value !== null && !known
      ? [{ slug: value, name: value }, ...options]
      : options;

  return (
    <Card>
      <label className={ROW_CLS}>
        <span className={ROW_LABEL_CLS}>{s.ui_provider_label}</span>
        <span className="relative flex flex-1 min-w-0 items-center">
          <select
            className={`${INPUT_CLS} w-full pr-5`}
            value={value ?? ""}
            disabled={loading || trimmedModel.length === 0}
            onChange={(e) =>
              onChange(e.target.value === "" ? null : e.target.value)
            }
          >
            <option value="">
              {loading ? s.ui_provider_loading : s.ui_provider_auto}
            </option>
            {merged.map((o) => (
              <option key={o.slug} value={o.slug}>
                {o.name}
              </option>
            ))}
          </select>
          <SelectChevron />
        </span>
      </label>
    </Card>
  );
}
