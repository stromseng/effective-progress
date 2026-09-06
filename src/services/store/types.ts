import type { TaskId, TaskSnapshot } from "../../task-model";
import type { Column } from "../../columns/types";

export interface RenderRow {
  readonly id: TaskId;
  readonly depth: number;
}

export interface TaskStore {
  readonly tasks: ReadonlyMap<TaskId, TaskSnapshot>;
  readonly renderOrder: ReadonlyArray<RenderRow>;
  readonly columns: ReadonlyMap<TaskId, ReadonlyArray<Column>>;
}
