// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

/// <reference lib="dom" />

// What the deployment's AI endpoint supports, so the admin UI only offers
// controls it can actually honour. Fetched once per app load from `/api/provider`
// and cached as a promise singleton, like the model catalogue.
//
// Every failure — including the 403 a non-admin gets — resolves to the generic
// profile rather than rejecting: "show nothing provider-specific" is the correct
// rendering in exactly those cases.

import {
  capabilitiesFor,
  type ProviderCapabilities,
  type ProviderFlavor,
} from "../../ai/provider-profile";

export type { ProviderCapabilities };

export type ProviderProfile = {
  flavor: ProviderFlavor;
  capabilities: ProviderCapabilities;
};

export const GENERIC_PROFILE: ProviderProfile = {
  flavor: "generic",
  capabilities: capabilitiesFor("generic"),
};

let cache: Promise<ProviderProfile> | null = null;

function authHeader(): Record<string, string> {
  const initData = window.Telegram?.WebApp?.initData ?? "";
  return { Authorization: `tma ${initData}` };
}

export function fetchProviderProfile(): Promise<ProviderProfile> {
  if (cache) return cache;
  cache = (async () => {
    try {
      const res = await fetch("/api/provider", { headers: authHeader() });
      if (!res.ok) return GENERIC_PROFILE;
      const json = (await res.json()) as Partial<ProviderProfile>;
      if (!json.capabilities || !json.flavor) return GENERIC_PROFILE;
      return { flavor: json.flavor, capabilities: json.capabilities };
    } catch {
      return GENERIC_PROFILE;
    }
  })();
  return cache;
}
