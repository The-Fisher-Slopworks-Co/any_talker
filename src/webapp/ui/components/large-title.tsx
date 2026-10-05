// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { ReactNode } from "react";

// iOS Large Title: every screen names itself above its content.
export function LargeTitle({ children }: { children: ReactNode }) {
  return (
    <h1 className="m-0 px-1 pb-3 text-[34px] leading-[41px] font-bold tracking-[0.37px]">
      {children}
    </h1>
  );
}
