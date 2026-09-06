import type { TaskId, TaskSnapshot } from "../../task-model";
import type { Column } from "../../columns/types";

export interface TaskOrderEntry {
  readonly id: TaskId;
  readonly depth: number;
}

export interface ProgressState {
  readonly tasks: ReadonlyMap<TaskId, TaskSnapshot>;
  readonly renderOrder: ReadonlyArray<TaskOrderEntry>;
  readonly columns: ReadonlyMap<TaskId, ReadonlyArray<Column>>;
}

/** @deprecated Use TaskOrderEntry. */
export type RenderRow = TaskOrderEntry;

/** @deprecated Use ProgressState. */
export type TaskStore = ProgressState;
