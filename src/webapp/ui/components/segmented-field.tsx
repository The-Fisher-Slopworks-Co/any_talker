// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// Telegram-style segmented control: a row of radio buttons with a sliding
// highlight behind the active one.
export function SegmentedField<T>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
}) {
  const activeIdx = options.findIndex((o) => o.value === value);
  return (
    <div
      className="relative flex bg-tg-section rounded-[10px] p-[3px] shadow-[0_0_0_1px_var(--tg-separator)]"
      role="radiogroup"
    >
      <div
        className="absolute top-[3px] bottom-[3px] left-[3px] z-0 pointer-events-none bg-tg-button rounded-lg transition-transform duration-[180ms] ease-tg-spring"
        style={{
          width: `calc((100% - 6px) / ${options.length})`,
          transform: `translateX(${activeIdx * 100}%)`,
        }}
      />
      {options.map((o) => (
        <button
          key={o.label}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className="relative z-10 flex-1 border-0 bg-transparent px-1.5 py-2 rounded-lg text-tg-text text-[13px] font-medium cursor-pointer transition-colors aria-checked:text-tg-button-text"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
