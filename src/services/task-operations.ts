import type { Effect, Option } from "effect";
import type { TaskId, TaskSnapshot } from "../task-model";
import type { AddTaskOptions, UpdateTaskOptions } from "../tasks/options";

/** Task operations shared by the progress service and its backing store. */
export interface TaskOperations {
  readonly addTask: <M>(options: AddTaskOptions<M>) => Effect.Effect<TaskId>;
  readonly updateTask: (taskId: TaskId, options: UpdateTaskOptions) => Effect.Effect<void>;
  readonly incrementSucceeded: (taskId: TaskId, amount?: number) => Effect.Effect<void>;
  readonly incrementFailed: (taskId: TaskId, amount?: number) => Effect.Effect<void>;
  readonly completeTask: (taskId: TaskId) => Effect.Effect<void>;
  readonly failTask: (taskId: TaskId) => Effect.Effect<void>;
  readonly getTask: (taskId: TaskId) => Effect.Effect<Option.Option<TaskSnapshot>>;
  readonly listTasks: Effect.Effect<ReadonlyArray<TaskSnapshot>>;
}
