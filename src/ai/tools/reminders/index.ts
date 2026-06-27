// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Tool } from "../registry";
import type { Storage } from "../../../storage/types";
import { createScheduleReminderAtTool } from "./scheduleAt";
import { createScheduleReminderInTool } from "./scheduleIn";
import { createListRemindersTool } from "./list";
import { createCancelReminderTool } from "./cancel";

export function createReminderTools(deps: { storage: Storage }): Tool[] {
  return [
    createScheduleReminderInTool(deps) as Tool,
    createScheduleReminderAtTool(deps) as Tool,
    createListRemindersTool(deps) as Tool,
    createCancelReminderTool(deps) as Tool,
  ];
}
