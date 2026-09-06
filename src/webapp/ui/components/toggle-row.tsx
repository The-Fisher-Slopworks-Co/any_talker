// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { Card } from "./layout";
import { Toggle } from "./controls";
import { ROW_CLS, ROW_LABEL_CLS } from "./row";

// A single-row card holding a labelled switch: the "turn this override on"
// header the gender/timezone/language fields all sit behind.
export function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Card>
      <div className={ROW_CLS}>
        <span className={ROW_LABEL_CLS}>{label}</span>
        <span className="flex-1" />
        <Toggle value={value} onChange={onChange} />
      </div>
    </Card>
  );
}
