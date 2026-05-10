import type { TaskSnapshot } from "../../../types";

export const isDeterminate = (
  task: TaskSnapshot,
): task is TaskSnapshot & { readonly units: TaskSnapshot["units"] & { readonly total: number } } =>
  task.units.total !== undefined;
