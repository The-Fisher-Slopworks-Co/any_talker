// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// iOS segmented control: a grey track with a white, raised thumb that slides
// behind the active option.
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
      className="relative flex bg-tg-text/[0.07] rounded-[9px] p-0.5"
      role="radiogroup"
    >
      <div
        className="absolute top-0.5 bottom-0.5 left-0.5 z-0 pointer-events-none bg-tg-section rounded-[7px] shadow-[0_3px_8px_rgb(0_0_0/0.12),0_3px_1px_rgb(0_0_0/0.04)] transition-transform duration-[180ms] ease-tg-spring"
        style={{
          width: `calc((100% - 4px) / ${options.length})`,
          transform: `translateX(${activeIdx * 100}%)`,
        }}
      />
      {options.map((o) => (
        <button
          key={o.label}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className="relative z-10 flex-1 border-0 bg-transparent px-1.5 py-1.5 rounded-[7px] text-tg-text text-[13px] leading-[18px] font-medium cursor-pointer aria-checked:font-semibold"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
