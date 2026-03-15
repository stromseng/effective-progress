import { Brand, Context, Effect, Option, Schema } from "effect";

const TaskIdSchema = Schema.Number.pipe(Schema.brand("TaskId"));

export type TaskId = typeof TaskIdSchema.Type;
export const TaskId = Brand.nominal<TaskId>();

export const TaskStatusSchema = Schema.Literal("running", "done", "failed");

export type TaskStatus = typeof TaskStatusSchema.Type;
export const TaskCountDisplaySchema = Schema.Literal("processedOnly", "detailed");
export type TaskCountDisplay = typeof TaskCountDisplaySchema.Type;

export interface TaskColumnDef<M> {
  readonly header: string;
  readonly render: (task: TaskSnapshot & { readonly metadata: M }) => string;
  readonly align?: "left" | "right";
}

export interface TaskHandle<M> {
  readonly id: TaskId;
  readonly getMetadata: Effect.Effect<M>;
  readonly setMetadata: (metadata: M) => Effect.Effect<void>;
  readonly updateMetadata: (f: (m: M) => M) => Effect.Effect<void>;
  readonly incrementSucceeded: (amount?: number) => Effect.Effect<void>;
  readonly incrementFailed: (amount?: number) => Effect.Effect<void>;
  readonly update: (options: UpdateTaskOptions) => Effect.Effect<void>;
  readonly complete: Effect.Effect<void>;
  readonly fail: Effect.Effect<void>;
  readonly getSnapshot: Effect.Effect<TaskSnapshot>;
}

export interface AddTaskOptions<M = void> {
  readonly description: string;
  readonly total?: number;
  readonly transient?: boolean;
  readonly parentId?: TaskId;
  readonly countDisplay?: TaskCountDisplay;
  readonly metadata?: M;
  readonly columns?: ReadonlyArray<TaskColumnDef<M>>;
}

export interface UpdateTaskOptions {
  readonly description?: string;
  readonly succeeded?: number;
  readonly failed?: number;
  readonly total?: number;
  readonly transient?: boolean;
  readonly countDisplay?: TaskCountDisplay;
}

export type TrackOptions = Exclude<AddTaskOptions, "parentId">;

export const TaskUnitsSchema = Schema.Struct({
  succeeded: Schema.Number,
  failed: Schema.Number,
  processed: Schema.Number,
  total: Schema.optional(Schema.Number),
});

export type TaskUnits = typeof TaskUnitsSchema.Type;

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
  metadata: Schema.Unknown,
});

export type TaskSnapshot = typeof TaskSnapshotSchema.Type;

export const TaskSnapshot = (snapshot: TaskSnapshot): TaskSnapshot => snapshot;

export interface RenderRow {
  readonly id: TaskId;
  readonly depth: number;
}

export interface TaskStore {
  readonly tasks: Map<TaskId, TaskSnapshot>;
  readonly renderOrder: ReadonlyArray<RenderRow>;
  readonly columns: Map<TaskId, ReadonlyArray<TaskColumnDef<unknown>>>;
}

export interface ProgressService {
  // biome-ignore lint: any is needed here — the store is heterogeneous
  readonly addTask: (options: AddTaskOptions<any>) => Effect.Effect<TaskId>;
  readonly updateTask: (taskId: TaskId, options: UpdateTaskOptions) => Effect.Effect<void>;
  readonly incrementSucceeded: (taskId: TaskId, amount?: number) => Effect.Effect<void>;
  readonly incrementFailed: (taskId: TaskId, amount?: number) => Effect.Effect<void>;
  readonly completeTask: (taskId: TaskId) => Effect.Effect<void>;
  readonly failTask: (taskId: TaskId) => Effect.Effect<void>;
  readonly log: (...args: ReadonlyArray<unknown>) => Effect.Effect<void>;
  readonly getTask: (taskId: TaskId) => Effect.Effect<Option.Option<TaskSnapshot>>;
  readonly listTasks: Effect.Effect<ReadonlyArray<TaskSnapshot>>;
  readonly setMetadata: (taskId: TaskId, metadata: unknown) => Effect.Effect<void>;
  readonly getMetadata: (taskId: TaskId) => Effect.Effect<unknown>;
  readonly runTask: {
    <A, E, R>(
      effect: Effect.Effect<A, E, R>,
      options: AddTaskOptions,
    ): Effect.Effect<A, E, Exclude<R, Task>>;
    <A, E, R>(
      options: AddTaskOptions,
    ): (effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, Exclude<R, Task>>;
  };
  readonly withTask: {
    <A, E, R>(
      effect: Effect.Effect<A, E, R>,
      options: AddTaskOptions,
    ): Effect.Effect<A, E, Exclude<R, Task>>;
    <A, E, R>(
      options: AddTaskOptions,
    ): (effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, Exclude<R, Task>>;
  };
}

export class Task extends Context.Tag("stromseng.dev/effective-progress/Task")<Task, TaskId>() {}

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
  kind: Schema.Literal("succeeded", "failed"),
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

export const ProgressTaskEventSchema = Schema.Union(
  TaskAddedEvent,
  TaskUpdatedEvent,
  TaskAdvancedEvent,
  TaskCompletedEvent,
  TaskFailedEvent,
  TaskRemovedEvent,
);

export type ProgressTaskEvent = typeof ProgressTaskEventSchema.Type;

export const decodeProgressTaskEvent = Schema.decodeUnknownSync(ProgressTaskEventSchema);
