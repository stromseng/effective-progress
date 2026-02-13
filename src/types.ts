import { Brand, Context, Effect, Option, Schema } from "effect";

export const SPINNER_FRAMES = ["-", "\\", "|", "/"] as const;
export const DEFAULT_PROGRESS_BAR_WIDTH = 30;

export const ProgressBarConfigSchema = Schema.Struct({
  isTTY: Schema.Boolean,
  disableUserInput: Schema.Boolean,
  spinnerFrames: Schema.NonEmptyArray(Schema.String),
  barWidth: Schema.Number,
  fillChar: Schema.String,
  emptyChar: Schema.String,
  leftBracket: Schema.String,
  rightBracket: Schema.String,
  maxLogLines: Schema.Number,
  nonTtyUpdateStep: Schema.Number,
});

export type ProgressBarConfigShape = typeof ProgressBarConfigSchema.Type;

export const defaultProgressBarConfig: ProgressBarConfigShape = {
  isTTY: Boolean(process.stderr.isTTY),
  disableUserInput: true,
  spinnerFrames: SPINNER_FRAMES,
  barWidth: DEFAULT_PROGRESS_BAR_WIDTH,
  fillChar: "━",
  emptyChar: "─",
  leftBracket: "",
  rightBracket: "",
  maxLogLines: 0,
  nonTtyUpdateStep: 5,
};

export class ProgressBarConfig extends Context.Tag("stromseng.dev/ProgressBarConfig")<
  ProgressBarConfig,
  ProgressBarConfigShape
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
}

export interface UpdateTaskOptions {
  readonly description?: string;
  readonly completed?: number;
  readonly total?: number;
  readonly transient?: boolean;
}

export interface TrackOptions {
  readonly description: string;
  readonly total?: number;
  readonly transient?: boolean;
}

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
  readonly withTask: <A, E, R>(
    options: AddTaskOptions,
    effect: (taskId: TaskId) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, R>;
  readonly trackIterable: <A, B, E, R>(
    iterable: Iterable<A>,
    options: TrackOptions,
    f: (item: A, index: number) => Effect.Effect<B, E, R>,
  ) => Effect.Effect<ReadonlyArray<B>, E, R>;
}

export class Progress extends Context.Tag("stromseng.dev/Progress")<Progress, ProgressService>() {}

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

export const isIndeterminateTask = (snapshot: TaskSnapshot) =>
  snapshot.units._tag === "IndeterminateTaskUnits";

export const nextSpinnerFrame = (index: number) => (index + 1) % SPINNER_FRAMES.length;
