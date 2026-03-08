import type { DeterminateTaskUnits, TaskSnapshot } from "../../types";
import type { TaskRowModel } from "../snapshot/types";

export const isDeterminate = (
  task: TaskSnapshot,
): task is TaskSnapshot & { readonly units: DeterminateTaskUnits } =>
  task.units._tag === "DeterminateTaskUnits";

export const hasDeterminateRows = (rows: ReadonlyArray<TaskRowModel>): boolean =>
  rows.some((row) => isDeterminate(row.task));
