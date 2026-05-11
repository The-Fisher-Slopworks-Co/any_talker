import { ROW_LABEL_CLS, SELECTABLE_ROW_CLS } from "./row";

export function SelectRow({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button type="button" className={SELECTABLE_ROW_CLS} onClick={onSelect}>
      <span className={ROW_LABEL_CLS}>{label}</span>
      <span className="flex-1" />
      {selected ? <span className="text-tg-link">✓</span> : null}
    </button>
  );
}

export function NavRow({
  title,
  subtitle,
  onClick,
}: {
  title: string;
  subtitle?: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className={SELECTABLE_ROW_CLS} onClick={onClick}>
      <div className="flex-1 min-w-0">
        <div className="truncate">{title}</div>
        {subtitle ? (
          <div className="text-[13px] text-tg-hint truncate">{subtitle}</div>
        ) : null}
      </div>
      <span className="text-tg-hint text-[15px]">›</span>
    </button>
  );
}
