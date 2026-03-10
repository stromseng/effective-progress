import type { TaskSnapshot } from "../../types";
import type { TaskRowModel } from "../store/types";

export const isDeterminate = (
  task: TaskSnapshot,
): task is TaskSnapshot & { readonly units: TaskSnapshot["units"] & { readonly total: number } } =>
  task.units.total !== undefined;

const hasDeterminateRows = (rows: ReadonlyArray<TaskRowModel>): boolean =>
  rows.some((row) => isDeterminate(row.task));
