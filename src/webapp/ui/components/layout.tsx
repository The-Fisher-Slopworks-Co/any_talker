// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { ReactNode } from "react";

export function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <div className="section-header px-4 pb-0.5 text-[13px] leading-[18px] tracking-[-0.08px] uppercase text-tg-section-header">
      {children}
    </div>
  );
}

export function SectionFooter({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 pt-0.5 text-[13px] leading-[18px] tracking-[-0.08px] text-tg-hint">
      {children}
    </div>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return (
    <div className="card bg-tg-section rounded-xl overflow-hidden">
      {children}
    </div>
  );
}

export function Stack({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-2">{children}</div>;
}
