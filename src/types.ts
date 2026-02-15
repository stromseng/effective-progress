import { Brand, Context, Effect, Option, Schema } from "effect";
import type { PartialDeep } from "type-fest";
import { defaultProgressBarColors, ProgressBarColorsSchema } from "./colors";

export const RendererConfigSchema = Schema.Struct({
  disableUserInput: Schema.Boolean,
  renderIntervalMillis: Schema.Number,
  maxLogLines: Schema.optional(Schema.Number),
  nonTtyUpdateStep: Schema.Number,
});
export type RendererConfigShape = typeof RendererConfigSchema.Type;
export const decodeRendererConfigSync = Schema.decodeUnknownSync(RendererConfigSchema);

export const ProgressBarConfigSchema = Schema.Struct({
  spinnerFrames: Schema.NonEmptyArray(Schema.String),
  barWidth: Schema.Number,
  fillChar: Schema.String,
  emptyChar: Schema.String,
  leftBracket: Schema.String,
  rightBracket: Schema.String,
  colors: ProgressBarColorsSchema,
});
export type ProgressBarConfigShape = typeof ProgressBarConfigSchema.Type;
export const decodeProgressBarConfigSync = Schema.decodeUnknownSync(ProgressBarConfigSchema);

export const defaultRendererConfig: RendererConfigShape = {
  disableUserInput: true,
  renderIntervalMillis: 50, // 20 FPS
  maxLogLines: 0,
  nonTtyUpdateStep: 5,
};

export const defaultProgressBarConfig: ProgressBarConfigShape = {
  spinnerFrames: ["-", "\\", "|", "/"],
  barWidth: 30,
  fillChar: "━",
  emptyChar: "─",
  leftBracket: "",
  rightBracket: "",
  colors: defaultProgressBarColors,
};

export class RendererConfig extends Context.Tag("stromseng.dev/RendererConfig")<
  RendererConfig,
  PartialDeep<RendererConfigShape>
>() {}

export class ProgressBarConfig extends Context.Tag("stromseng.dev/ProgressBarConfig")<
  ProgressBarConfig,
  PartialDeep<ProgressBarConfigShape>
>() {}

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
  progressbar: ProgressBarConfigSchema,
}) {}

export interface ProgressService {
  readonly addTask: (options: AddTaskOptions) => Effect.Effect<TaskId>;
  readonly updateTask: (taskId: TaskId, options: UpdateTaskOptions) => Effect.Effect<void>;
  readonly advanceTask: (taskId: TaskId, amount?: number) => Effect.Effect<void>;
  readonly completeTask: (taskId: TaskId) => Effect.Effect<void>;
  readonly failTask: (taskId: TaskId) => Effect.Effect<void>;
  readonly log: (...args: ReadonlyArray<unknown>) => Effect.Effect<void>;
  readonly getTask: (taskId: TaskId) => Effect.Effect<Option.Option<TaskSnapshot>>;
  readonly listTasks: Effect.Effect<ReadonlyArray<TaskSnapshot>>;
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

export class Task extends Context.Tag("stromseng.dev/Task")<Task, TaskId>() {}

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
