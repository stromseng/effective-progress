import type { TaskRowDerived, TaskTreeInfo } from "../columns/types";
import type { TaskSnapshot } from "../task-model";

export interface OrderedTask {
  readonly snapshot: TaskSnapshot;
  readonly depth: number;
}

export interface TaskRowModel {
  readonly task: TaskSnapshot;
  readonly tree: TaskTreeInfo;
  readonly derived: TaskRowDerived;
}
