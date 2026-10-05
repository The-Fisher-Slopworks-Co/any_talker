// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useEffect, useState } from "react";
import { useI18n } from "../i18n-context";
import {
  fetchProviderEndpoints,
  toProviderOptions,
  type ProviderOption,
} from "../provider-endpoints";
import { ValueSelectRow } from "./value-select-row";

// The providers serving `modelId`; null while they load.
export function useProviderOptions(modelId: string): ProviderOption[] | null {
  const [providers, setProviders] = useState<ProviderOption[] | null>(null);
  const trimmedModel = modelId.trim();

  useEffect(() => {
    if (trimmedModel.length === 0) {
      setProviders([]);
      return;
    }
    let cancelled = false;
    setProviders(null);
    fetchProviderEndpoints(trimmedModel)
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

  return providers;
}

// A picker row, to sit in a card with its siblings.
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
  const providers = useProviderOptions(modelId);
  const trimmedModel = modelId.trim();

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
    <ValueSelectRow
      label={s.ui_provider_label}
      value={value ?? ""}
      disabled={loading || trimmedModel.length === 0}
      onChange={(v) => onChange(v === "" ? null : v)}
    >
      <option value="">
        {loading ? s.ui_provider_loading : s.ui_provider_auto}
      </option>
      {merged.map((o) => (
        <option key={o.slug} value={o.slug}>
          {o.name}
        </option>
      ))}
    </ValueSelectRow>
  );
}
