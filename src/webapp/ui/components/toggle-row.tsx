// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { Card } from "./layout";
import { SwitchRow } from "./switch-row";

// A single-row card holding a labelled switch: the "turn this override on"
// header the gender/timezone/language fields all sit behind.
export function ToggleRow(props: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Card>
      <SwitchRow {...props} />
    </Card>
  );
}
