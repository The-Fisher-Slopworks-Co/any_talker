import { useI18n } from "../i18n-context";
import type { ProviderSort } from "../../../shared/types";

export function ProviderSortField({
  value,
  onChange,
}: {
  value: ProviderSort | null;
  onChange: (next: ProviderSort | null) => void;
}) {
  const { t: s } = useI18n();
  const options: { value: ProviderSort | null; label: string }[] = [
    { value: null, label: s.ui_sort_default },
    { value: "price", label: s.ui_sort_price },
    { value: "throughput", label: s.ui_sort_throughput },
    { value: "latency", label: s.ui_sort_latency },
  ];
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
