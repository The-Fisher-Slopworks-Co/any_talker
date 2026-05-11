import type { ReactNode } from "react";

export function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <div className="section-header px-4 pb-1.5 text-[14px] font-medium text-tg-section-header">
      {children}
    </div>
  );
}

export function SectionFooter({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 pt-1.5 text-[13px] leading-[1.35] text-tg-hint">
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
