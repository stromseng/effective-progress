import type { TaskId, TaskSnapshot } from "../tasks/model";
import type { AnyColumn } from "../columns/types";

export interface TaskOrderEntry {
  readonly id: TaskId;
  readonly depth: number;
}

export interface ProgressState {
  readonly tasks: ReadonlyMap<TaskId, TaskSnapshot>;
  readonly renderOrder: ReadonlyArray<TaskOrderEntry>;
  readonly columns: ReadonlyMap<TaskId, ReadonlyArray<AnyColumn>>;
}
