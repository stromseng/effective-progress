import type { Column } from "../columns/types";
import type { TaskId, TaskCountDisplay } from "../task-model";

export interface AddTaskOptions<M = void> {
  readonly description: string;
  readonly total?: number;
  /** Cleanup policy is fixed at creation; a transient parent makes its descendants transient. */
  readonly transient?: boolean;
  /** Missing or removed parent IDs are normalized to root tasks. */
  readonly parentId?: TaskId;
  readonly countDisplay?: TaskCountDisplay;
  readonly metadata?: M;
  readonly columns?: ReadonlyArray<Column<M>>;
}

/** Updates apply only while running; non-finite counters preserve their previous values. */
export interface UpdateTaskOptions {
  readonly description?: string;
  readonly succeeded?: number;
  readonly failed?: number;
  readonly total?: number;
  readonly countDisplay?: TaskCountDisplay;
}

export type TrackOptions = Omit<AddTaskOptions, "parentId">;
