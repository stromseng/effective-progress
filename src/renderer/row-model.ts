import type { TaskRowDerived, TaskSnapshot, TaskTreeInfo } from "../types";

export interface OrderedTask {
  readonly snapshot: TaskSnapshot;
  readonly depth: number;
}

export interface TaskRowModel {
  readonly task: TaskSnapshot;
  readonly tree: TaskTreeInfo;
  readonly derived: TaskRowDerived;
}
