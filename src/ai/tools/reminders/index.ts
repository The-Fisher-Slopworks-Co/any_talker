import type { Tool } from "../registry";
import type { Storage } from "../../../storage/types";
import { createScheduleReminderAtTool } from "./scheduleAt";
import { createScheduleReminderInTool } from "./scheduleIn";

export function createReminderTools(deps: { storage: Storage }): Tool[] {
  return [
    createScheduleReminderInTool(deps) as Tool,
    createScheduleReminderAtTool(deps) as Tool,
  ];
}
