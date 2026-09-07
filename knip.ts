// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { KnipConfig } from "knip";

const config: KnipConfig = {
  entry: [
    // The admin UI is reached through a Bun HTML import
    // (`webapp/server.ts` → `ui/index.html` → `<script src="./app.tsx">`).
    // Knip does not follow the HTML hop, so the React root is named directly —
    // without it the whole `ui/` tree reads as unreachable.
    "src/webapp/ui/app.tsx",
    // Co-located tests are roots of their own: an export that only a test
    // reaches is still reached.
    "src/**/*.test.{ts,tsx}",
    // The e2e suite is its own run (`bun run e2e`); its specs are the only
    // thing that reaches the harness modules around them.
    "e2e/**/*.test.ts",
  ],
  project: ["src/**/*.{ts,tsx,css}", "e2e/**/*.ts"],
  // Consumed by Bun from `bunfig.toml`'s `[serve.static]` plugin list, which
  // knip has no reason to read.
  ignoreDependencies: ["bun-plugin-tailwind"],
};

export default config;
