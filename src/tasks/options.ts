import type { AnyColumn } from "../columns/types";
import type { TaskId, TaskCountDisplay } from "./model";

/** Options accepted by `task`, `all`, and `forEach`. The parent is inferred from the current task. */
export interface TaskOptions<M = void> {
  readonly description: string;
  readonly total?: number;
  /** Cleanup policy is fixed at creation; a transient parent makes its descendants transient. */
  readonly transient?: boolean;
  readonly countDisplay?: TaskCountDisplay;
  readonly metadata?: M;
  readonly columns?: ReadonlyArray<AnyColumn<M>>;
}

/** Service-level creation options; `TaskOperations.addTask` accepts an explicit parent. */
export interface AddTaskOptions<M = void> extends TaskOptions<M> {
  /** Missing or removed parent IDs are normalized to root tasks. */
  readonly parentId?: TaskId;
}

/** Updates apply only while running; non-finite counters preserve their previous values. */
export interface UpdateTaskOptions {
  readonly description?: string;
  readonly succeeded?: number;
  readonly failed?: number;
  readonly total?: number;
  readonly countDisplay?: TaskCountDisplay;
}
