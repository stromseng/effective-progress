import { Brand, Context, Effect, Option, Schema } from "effect";
import type { PartialDeep } from "type-fest";
import type { ProgressColumn } from "./renderer";

export const RendererConfigSchema = Schema.Struct({
  disableUserInput: Schema.Boolean,
  renderIntervalMillis: Schema.Number,
  maxLogLines: Schema.optional(Schema.Number),
  nonTtyUpdateStep: Schema.Number,
  width: Schema.Union(Schema.Number, Schema.Literal("fullwidth")),
  columnGap: Schema.Number,
  columns: Schema.Array(Schema.Unknown),
});
export type RendererConfigShape = {
  readonly disableUserInput: boolean;
  readonly renderIntervalMillis: number;
  readonly maxLogLines?: number;
  readonly nonTtyUpdateStep: number;
  readonly width: number | "fullwidth";
  readonly columnGap: number;
  readonly columns: ReadonlyArray<ProgressColumn | string>;
};
const decodeRendererConfigSchemaSync = Schema.decodeUnknownSync(RendererConfigSchema);
export const decodeRendererConfigSync = (input: unknown): RendererConfigShape => {
  if (typeof input === "object" && input !== null && "determinateTaskLayout" in input) {
    throw new Error("determinateTaskLayout has been removed. Use columns instead.");
  }
  if (typeof input === "object" && input !== null && "maxTaskWidth" in input) {
    throw new Error("maxTaskWidth has been removed. Use width on RendererConfig instead.");
  }

  return decodeRendererConfigSchemaSync(input) as RendererConfigShape;
};

export const ProgressBarConfigSchema = Schema.Struct({
  spinnerFrames: Schema.NonEmptyArray(Schema.String),
  barWidth: Schema.Number,
  fillChar: Schema.String,
  emptyChar: Schema.String,
  leftBracket: Schema.String,
  rightBracket: Schema.String,
});
export type ProgressBarConfigShape = typeof ProgressBarConfigSchema.Type;
export const decodeProgressBarConfigSync = Schema.decodeUnknownSync(ProgressBarConfigSchema);

export const defaultRendererConfig: RendererConfigShape = {
  disableUserInput: true,
  renderIntervalMillis: 100, // 10 FPS
  maxLogLines: 0,
  nonTtyUpdateStep: 5,
  width: 120,
  columnGap: 1,
  columns: [],
};

export const defaultProgressBarConfig: ProgressBarConfigShape = {
  spinnerFrames: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
  barWidth: 40,
  fillChar: "━",
  emptyChar: "─",
  leftBracket: "",
  rightBracket: "",
};

export class RendererConfig extends Context.Tag("stromseng.dev/effective-progress/RendererConfig")<
  RendererConfig,
  PartialDeep<RendererConfigShape>
>() {}

export class ProgressBarConfig extends Context.Tag(
  "stromseng.dev/effective-progress/ProgressBarConfig",
)<ProgressBarConfig, PartialDeep<ProgressBarConfigShape>>() {}

const TaskIdSchema = Schema.Number.pipe(Schema.brand("TaskId"));

export type TaskId = typeof TaskIdSchema.Type;
export const TaskId = Brand.nominal<TaskId>();

export const TaskStatusSchema = Schema.Literal("running", "done", "failed");

export type TaskStatus = typeof TaskStatusSchema.Type;

export interface AddTaskOptions {
  readonly description: string;
  readonly total?: number;
  readonly transient?: boolean;
  readonly parentId?: TaskId;
  readonly progressbar?: PartialDeep<ProgressBarConfigShape>;
}

export interface UpdateTaskOptions {
  readonly description?: string;
  readonly completed?: number;
  readonly total?: number;
  readonly transient?: boolean;
}

export type TrackOptions = Exclude<AddTaskOptions, "parentId">;

export class DeterminateTaskUnits extends Schema.TaggedClass<DeterminateTaskUnits>()(
  "DeterminateTaskUnits",
  {
    completed: Schema.Number,
    total: Schema.Number,
  },
) {}

export class IndeterminateTaskUnits extends Schema.TaggedClass<IndeterminateTaskUnits>()(
  "IndeterminateTaskUnits",
  {
    spinnerFrame: Schema.Number,
  },
) {}

export const TaskUnitsSchema = Schema.Union(DeterminateTaskUnits, IndeterminateTaskUnits);

export type TaskUnits = typeof TaskUnitsSchema.Type;

export class TaskSnapshot extends Schema.TaggedClass<TaskSnapshot>()("TaskSnapshot", {
  id: TaskIdSchema,
  parentId: Schema.NullOr(TaskIdSchema),
  description: Schema.String,
  status: TaskStatusSchema,
  transient: Schema.Boolean,
  units: TaskUnitsSchema,
  config: ProgressBarConfigSchema,
  startedAt: Schema.Number,
  completedAt: Schema.NullOr(Schema.Number),
}) {}

export interface RenderRow {
  readonly id: TaskId;
  readonly depth: number;
}

export interface TaskStore {
  readonly tasks: Map<TaskId, TaskSnapshot>;
  readonly renderOrder: ReadonlyArray<RenderRow>;
}

export interface ProgressService {
  readonly addTask: (options: AddTaskOptions) => Effect.Effect<TaskId>;
  readonly updateTask: (taskId: TaskId, options: UpdateTaskOptions) => Effect.Effect<void>;
  readonly advanceTask: (taskId: TaskId, amount?: number) => Effect.Effect<void>;
  readonly completeTask: (taskId: TaskId) => Effect.Effect<void>;
  readonly failTask: (taskId: TaskId) => Effect.Effect<void>;
  readonly log: (...args: ReadonlyArray<unknown>) => Effect.Effect<void>;
  readonly getTask: (taskId: TaskId) => Effect.Effect<Option.Option<TaskSnapshot>>;
  readonly listTasks: Effect.Effect<ReadonlyArray<TaskSnapshot>>;
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
}) {}

export class TaskUpdatedEvent extends Schema.TaggedClass<TaskUpdatedEvent>()("TaskUpdated", {
  taskId: TaskIdSchema,
  description: Schema.optional(Schema.String),
  completed: Schema.optional(Schema.Number),
  total: Schema.optional(Schema.Number),
  transient: Schema.optional(Schema.Boolean),
}) {}

export class TaskAdvancedEvent extends Schema.TaggedClass<TaskAdvancedEvent>()("TaskAdvanced", {
  taskId: TaskIdSchema,
  amount: Schema.Number,
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
