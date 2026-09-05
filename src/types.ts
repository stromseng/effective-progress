import { Brand, Context, Effect, Option, Schema } from "effect";
import type { ReactNode } from "react";

const TaskIdSchema = Schema.Number.pipe(Schema.brand("TaskId"));

export type TaskId = typeof TaskIdSchema.Type;
export const TaskId = Brand.nominal<TaskId>();

export const TaskStatusSchema = Schema.Literals(["running", "done", "failed"]);

export type TaskStatus = typeof TaskStatusSchema.Type;
export const TaskCountDisplaySchema = Schema.Literals(["processedOnly", "detailed"]);
export type TaskCountDisplay = typeof TaskCountDisplaySchema.Type;
export type ColumnAlign = "left" | "center" | "right";

export interface TaskTreeInfo {
  readonly depth: number;
  readonly hasNextSibling: boolean;
  readonly hasChildren: boolean;
  readonly ancestorHasNextSibling: ReadonlyArray<boolean>;
}

export interface TaskRowDerived {
  readonly treePrefix: string;
  readonly treePrefixWidth: number;
  readonly descriptionWidth: number;
  readonly treePrefixedDescriptionWidth: number;
  readonly hasRenderableProgress: boolean;
  readonly isDeterminate: boolean;
}

/** All data available to a column cell. */
export interface CellInfo<M = unknown> {
  readonly task: TaskSnapshot & { readonly metadata: M };
  readonly tree: TaskTreeInfo;
  readonly derived: TaskRowDerived;
}

export interface ColumnRenderContext<P = void> {
  readonly width?: number;
  readonly now: number;
  readonly spinnerTick: number;
  readonly prepared: P;
}

export type ColumnSizeValue<P = void> = number | ((prepared: P) => number | undefined);

type BivariantCallback<Args extends ReadonlyArray<unknown>, R> = {
  bivarianceHack: (...args: Args) => R;
}["bivarianceHack"];

export interface ColumnDef<M = unknown, P = void> {
  readonly prepare?: BivariantCallback<[rows: ReadonlyArray<CellInfo<M>>], P>;
  readonly render: BivariantCallback<[cell: CellInfo<M>, ctx: ColumnRenderContext<P>], ReactNode>;
  readonly align?: ColumnAlign;
  readonly flexGrow?: ColumnSizeValue<P>;
  readonly flexShrink?: ColumnSizeValue<P>;
  readonly flexBasis?: ColumnSizeValue<P>;
  readonly minWidth?: ColumnSizeValue<P>;
}

/**
 * A typed facade over a single task created through the callback form of `task(...)`.
 *
 * Use this handle to update counts, metadata, description, or to explicitly finalize the task
 * before the callback exits. If the callback returns or fails while the task is still `running`,
 * the library auto-finalizes it from the callback exit status instead.
 */
export interface TaskHandle<M> {
  readonly id: TaskId;
  /** Reads the current metadata value for the task using the metadata type inferred at creation. */
  readonly getMetadata: Effect.Effect<M>;
  /** Replaces the task metadata. */
  readonly setMetadata: (metadata: M) => Effect.Effect<void>;
  /** Updates the current metadata value atomically. */
  readonly updateMetadata: (f: (m: M) => M) => Effect.Effect<void>;
  /** Increments the succeeded counter for the task. */
  readonly incrementSucceeded: (amount?: number) => Effect.Effect<void>;
  /** Increments the failed counter for the task. */
  readonly incrementFailed: (amount?: number) => Effect.Effect<void>;
  /** Updates mutable task fields such as description, totals, and count display. */
  readonly update: (options: UpdateTaskOptions) => Effect.Effect<void>;
  /** Marks the task as done immediately. Finalization is terminal once the task leaves `running`. */
  readonly complete: Effect.Effect<void>;
  /** Marks the task as failed immediately. Finalization is terminal once the task leaves `running`. */
  readonly fail: Effect.Effect<void>;
  /** Reads the latest task snapshot. */
  readonly getSnapshot: Effect.Effect<TaskSnapshot>;
}

export interface AddTaskOptions<M = void> {
  readonly description: string;
  readonly total?: number;
  readonly transient?: boolean;
  readonly parentId?: TaskId;
  readonly countDisplay?: TaskCountDisplay;
  readonly metadata?: M;
  readonly columns?: ReadonlyArray<ColumnDef<M, any>>;
}

export interface UpdateTaskOptions {
  readonly description?: string;
  readonly succeeded?: number;
  readonly failed?: number;
  readonly total?: number;
  readonly transient?: boolean;
  readonly countDisplay?: TaskCountDisplay;
}

export type TrackOptions = Omit<AddTaskOptions, "parentId">;

export const TaskUnitsSchema = Schema.Struct({
  succeeded: Schema.Number,
  failed: Schema.Number,
  processed: Schema.Number,
  total: Schema.optional(Schema.Number),
});

export type TaskUnits = typeof TaskUnitsSchema.Type;

// A processed-count observation used to estimate ETA from recent throughput.
export const TaskProgressSampleSchema = Schema.Struct({
  timestamp: Schema.Number,
  processed: Schema.Number,
});

export type TaskProgressSample = typeof TaskProgressSampleSchema.Type;

export const TaskSnapshotSchema = Schema.Struct({
  id: TaskIdSchema,
  parentId: Schema.NullOr(TaskIdSchema),
  description: Schema.String,
  status: TaskStatusSchema,
  countDisplay: TaskCountDisplaySchema,
  transient: Schema.Boolean,
  units: TaskUnitsSchema,
  startedAt: Schema.Number,
  completedAt: Schema.NullOr(Schema.Number),
  progressSamples: Schema.Array(TaskProgressSampleSchema),
  metadata: Schema.Unknown,
});

export type TaskSnapshot = typeof TaskSnapshotSchema.Type;

export const TaskSnapshot = (snapshot: TaskSnapshot): TaskSnapshot => snapshot;

export interface RenderRow {
  readonly id: TaskId;
  readonly depth: number;
}

export interface TaskStore {
  readonly tasks: ReadonlyMap<TaskId, TaskSnapshot>;
  readonly renderOrder: ReadonlyArray<RenderRow>;
  readonly columns: ReadonlyMap<TaskId, ReadonlyArray<ColumnDef<any, any>>>;
}

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
  readonly setMetadata: (taskId: TaskId, metadata: unknown) => Effect.Effect<void>;
  readonly getMetadata: (taskId: TaskId) => Effect.Effect<unknown>;
}

export interface ProgressShape extends TaskOperations {
  readonly log: (...args: ReadonlyArray<unknown>) => Effect.Effect<void>;
  /**
   * Runs an effect inside a newly created task scope.
   *
   * The plain effect form auto-finalizes from the effect exit if the task is still `running`.
   * The callback form exposes a typed `TaskHandle` for metadata and explicit lifecycle control, and
   * also auto-finalizes from the callback exit if the handle did not already finalize the task.
   *
   * Use `Progress.task(...)` from `src/api.ts` when you want the service to be created automatically if needed.
   */
  readonly task: {
    <A, E, R>(
      effect: Effect.Effect<A, E, R>,
      options: AddTaskOptions,
    ): Effect.Effect<A, E, Exclude<R, Task>>;
    <A, E, R>(
      options: AddTaskOptions,
    ): (effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, Exclude<R, Task>>;
    <A, E, R>(
      f: (handle: TaskHandle<void>) => Effect.Effect<A, E, R>,
      options: AddTaskOptions<void>,
    ): Effect.Effect<A, E, Exclude<R, Task>>;
    <M, A, E, R>(
      f: (handle: TaskHandle<M>) => Effect.Effect<A, E, R>,
      options: AddTaskOptions<M> & { readonly metadata: M },
    ): Effect.Effect<A, E, Exclude<R, Task>>;
  };
}

export class Task extends Context.Service<Task, TaskId>()(
  "stromseng.dev/effective-progress/Task",
) {}

export class TaskAddedEvent extends Schema.TaggedClass<TaskAddedEvent>()("TaskAdded", {
  taskId: TaskIdSchema,
  parentId: Schema.NullOr(TaskIdSchema),
  description: Schema.String,
  total: Schema.optional(Schema.Number),
  transient: Schema.Boolean,
  countDisplay: TaskCountDisplaySchema,
}) {}

export class TaskUpdatedEvent extends Schema.TaggedClass<TaskUpdatedEvent>()("TaskUpdated", {
  taskId: TaskIdSchema,
  description: Schema.optional(Schema.String),
  succeeded: Schema.optional(Schema.Number),
  failed: Schema.optional(Schema.Number),
  processed: Schema.optional(Schema.Number),
  total: Schema.optional(Schema.Number),
  transient: Schema.optional(Schema.Boolean),
  countDisplay: Schema.optional(TaskCountDisplaySchema),
}) {}

export class TaskAdvancedEvent extends Schema.TaggedClass<TaskAdvancedEvent>()("TaskAdvanced", {
  taskId: TaskIdSchema,
  amount: Schema.Number,
  kind: Schema.Literals(["succeeded", "failed"]),
}) {}

export class TaskCompletedEvent extends Schema.TaggedClass<TaskCompletedEvent>()("TaskCompleted", {
  taskId: TaskIdSchema,
}) {}

export class TaskFailedEvent extends Schema.TaggedClass<TaskFailedEvent>()("TaskFailed", {
  taskId: TaskIdSchema,
}) {}

export class TaskRemovedEvent extends Schema.TaggedClass<TaskRemovedEvent>()("TaskRemoved", {
  taskId: TaskIdSchema,
}) {}

export const ProgressTaskEventSchema = Schema.Union([
  TaskAddedEvent,
  TaskUpdatedEvent,
  TaskAdvancedEvent,
  TaskCompletedEvent,
  TaskFailedEvent,
  TaskRemovedEvent,
]);

export type ProgressTaskEvent = typeof ProgressTaskEventSchema.Type;

export const decodeProgressTaskEvent = Schema.decodeUnknownSync(ProgressTaskEventSchema);
