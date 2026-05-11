export const ROW_CLS = "row relative flex items-center gap-3 px-4 py-[11px]";
export const ROW_LABEL_CLS = "shrink-0 text-base";
export const ROW_VALUE_CLS = "flex-1 text-right text-tg-hint text-[15px]";

const INPUT_BASE_CLS =
  "flex-1 min-w-0 bg-transparent border-0 p-0 text-base text-tg-text";
export const INPUT_CLS = `${INPUT_BASE_CLS} text-right`;
export const INPUT_LEFT_CLS = `${INPUT_BASE_CLS} text-left`;

export const SELECTABLE_ROW_CLS = `${ROW_CLS} text-left bg-transparent border-0 cursor-pointer w-full active:bg-[var(--tg-separator)]`;
