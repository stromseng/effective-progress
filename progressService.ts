import { Brand, Console, Context, Effect, Exit, FiberRef, Option, Ref, Schema } from "effect";
import { formatWithOptions } from "node:util";
import chalk from "chalk";

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

const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";
const CLEAR_LINE = "\x1b[2K";
const MOVE_UP_ONE = "\x1b[1A";
const RENDER_INTERVAL = "80 millis";
const DIRTY_DEBOUNCE_INTERVAL = "10 millis";
interface LogEntry {
  readonly id: number;
  readonly message: string;
}

const inferTotal = (iterable: Iterable<unknown>): number | undefined => {
  if (Array.isArray(iterable)) {
    return iterable.length;
  }

  if (typeof iterable === "string") {
    return iterable.length;
  }

  const candidate = iterable as { length?: unknown; size?: unknown };
  if (typeof candidate.length === "number") {
    return candidate.length;
  }

  if (typeof candidate.size === "number") {
    return candidate.size;
  }

  return undefined;
};

const renderDeterminate = (units: DeterminateTaskUnits, config: ProgressBarConfigShape): string => {
  const safeTotal = units.total <= 0 ? 1 : units.total;
  const ratio = Math.min(1, Math.max(0, units.completed / safeTotal));
  const filled = Math.round(ratio * config.barWidth);
  const bar = `${chalk.cyan(config.fillChar.repeat(filled))}${chalk.dim(config.emptyChar.repeat(config.barWidth - filled))}`;
  const percent = String(Math.round(ratio * 100)).padStart(3, " ");
  return `${chalk.dim(config.leftBracket)}${bar}${chalk.dim(config.rightBracket)} ${units.completed}/${units.total} ${chalk.bold(percent + "%")}`;
};

const buildTaskLine = (
  snapshot: TaskSnapshot,
  depth: number,
  tick: number,
  config: ProgressBarConfigShape,
): string => {
  const prefix = `${"  ".repeat(depth)}- ${snapshot.description}: `;

  if (snapshot.status === "failed") {
    return `${prefix}${chalk.red("[failed]")}`;
  }

  if (snapshot.status === "done") {
    if (snapshot.units._tag === "DeterminateTaskUnits") {
      return `${prefix}${chalk.green("[done]")} ${snapshot.units.completed}/${snapshot.units.total}`;
    }
    return `${prefix}${chalk.green("[done]")}`;
  }

  if (snapshot.units._tag === "DeterminateTaskUnits") {
    return prefix + renderDeterminate(snapshot.units, config);
  }

  const frames = config.spinnerFrames;
  const frameIndex = (snapshot.units.spinnerFrame + tick) % frames.length;
  return `${prefix}${chalk.yellow(frames[frameIndex])}`;
};

const orderTasksForRender = (
  tasks: ReadonlyArray<TaskSnapshot>,
): ReadonlyArray<{ snapshot: TaskSnapshot; depth: number }> => {
  const byParent = new Map<number | null, Array<TaskSnapshot>>();
  for (const task of tasks) {
    const bucket = byParent.get(task.parentId) ?? [];
    bucket.push(task);
    byParent.set(task.parentId, bucket);
  }

  const ordered: Array<{ snapshot: TaskSnapshot; depth: number }> = [];
  const visit = (parentId: number | null, depth: number) => {
    const children = byParent.get(parentId) ?? [];
    for (const child of children) {
      ordered.push({ snapshot: child, depth });
      visit(child.id, depth + 1);
    }
  };

  visit(null, 0);
  return ordered;
};

const runProgressServiceRenderer = (
  tasksRef: Ref.Ref<Map<TaskId, TaskSnapshot>>,
  logsRef: Ref.Ref<ReadonlyArray<LogEntry>>,
  dirtyRef: Ref.Ref<boolean>,
  config: ProgressBarConfigShape,
) => {
  const isTTY = config.isTTY;
  let previousLineCount = 0;
  let nonTTYLastLogId = 0;
  let nonTTYTaskSignatureById = new Map<number, string>();
  let tick = 0;
  let teardownInput: (() => void) | undefined;

  return Effect.gen(function* () {
    const clearTTY = () => {
      let output = "\r" + CLEAR_LINE;
      for (let i = 1; i < previousLineCount; i++) {
        output += MOVE_UP_ONE + CLEAR_LINE;
      }
      process.stderr.write(output + "\r");
      previousLineCount = 0;
    };

    const renderFrame = (mode: "tick" | "final") =>
      Effect.gen(function* () {
        const logs = yield* Ref.get(logsRef);
        const snapshots = Array.from((yield* Ref.get(tasksRef)).values()).filter(
          (task) => !(task.transient && task.status !== "running"),
        );
        const ordered = orderTasksForRender(snapshots);
        const frameTick = mode === "final" ? tick + 1 : tick;
        const taskLines = ordered.map(({ snapshot, depth }) => {
          const lineTick = isTTY ? frameTick : 0;
          return buildTaskLine(snapshot, depth, lineTick, config);
        });
        const logLines = logs.map((log) => log.message);
        const lines = [...logLines, ...taskLines];

        if (isTTY) {
          clearTTY();
          if (lines.length > 0) {
            process.stderr.write(lines.join("\n"));
            previousLineCount = lines.length;
          }
        } else {
          const appendedLogs = logs.filter((log) => log.id > nonTTYLastLogId);
          if (appendedLogs.length > 0) {
            process.stderr.write(appendedLogs.map((log) => log.message).join("\n") + "\n");
            nonTTYLastLogId = appendedLogs[appendedLogs.length - 1]?.id ?? nonTTYLastLogId;
          }

          const nextTaskSignatureById = new Map<number, string>();
          const changedTaskLines: Array<string> = [];
          const nonTtyUpdateStep = Math.max(1, Math.floor(config.nonTtyUpdateStep));

          for (let i = 0; i < ordered.length; i++) {
            const taskId = ordered[i]!.snapshot.id as number;
            const snapshot = ordered[i]!.snapshot;
            const line = taskLines[i]!;
            const signature =
              snapshot.units._tag === "DeterminateTaskUnits"
                ? `${snapshot.status}:${snapshot.description}:${Math.floor(snapshot.units.completed / nonTtyUpdateStep)}:${snapshot.units.total}`
                : `${snapshot.status}:${snapshot.description}`;

            nextTaskSignatureById.set(taskId, signature);
            if (nonTTYTaskSignatureById.get(taskId) !== signature) {
              changedTaskLines.push(line);
            }
          }

          if (changedTaskLines.length > 0) {
            process.stderr.write(changedTaskLines.join("\n") + "\n");
          }

          nonTTYTaskSignatureById = nextTaskSignatureById;
        }
      });

    if (isTTY) {
      process.stderr.write(HIDE_CURSOR);

      if (config.disableUserInput && process.stdin.isTTY) {
        const stdin = process.stdin;
        const wasRaw = Boolean(stdin.isRaw);
        stdin.resume();
        stdin.setRawMode?.(true);

        const onData = (chunk: Buffer) => {
          if (chunk.length === 1 && chunk[0] === 3) {
            process.kill(process.pid, "SIGINT");
          }
        };

        stdin.on("data", onData);

        teardownInput = () => {
          try {
            stdin.off("data", onData);
            stdin.setRawMode?.(wasRaw);
            stdin.pause();
          } catch {
            // Best effort terminal restoration.
          }
        };
      }
    }

    while (true) {
      const dirty = yield* Ref.getAndSet(dirtyRef, false);
      const hasActiveSpinners = yield* Ref.get(tasksRef).pipe(
        Effect.map((tasks) =>
          Array.from(tasks.values()).some(
            (task) => task.status === "running" && task.units._tag === "IndeterminateTaskUnits",
          ),
        ),
      );

      if (dirty || hasActiveSpinners) {
        yield* renderFrame("tick");
      }

      tick += 1;
      yield* Effect.sleep(RENDER_INTERVAL);
    }
  }).pipe(
    Effect.ensuring(
      Effect.gen(function* () {
        const logs = yield* Ref.get(logsRef);
        const snapshots = Array.from((yield* Ref.get(tasksRef)).values()).filter(
          (task) => !(task.transient && task.status !== "running"),
        );
        const ordered = orderTasksForRender(snapshots);
        const taskLines = ordered.map(({ snapshot, depth }) =>
          buildTaskLine(snapshot, depth, tick + 1, config),
        );
        const logLines = logs.map((log) => log.message);
        const lines = [...logLines, ...taskLines];

        if (isTTY) {
          let output = "\r" + CLEAR_LINE;
          for (let i = 1; i < previousLineCount; i++) {
            output += MOVE_UP_ONE + CLEAR_LINE;
          }

          if (lines.length > 0) {
            process.stderr.write(output + "\r" + lines.join("\n"));
          } else {
            process.stderr.write(output + "\r");
          }
        } else {
          const appendedLogs = logs.filter((log) => log.id > nonTTYLastLogId);
          if (appendedLogs.length > 0) {
            process.stderr.write(appendedLogs.map((log) => log.message).join("\n") + "\n");
            nonTTYLastLogId = appendedLogs[appendedLogs.length - 1]?.id ?? nonTTYLastLogId;
          }

          const nextTaskSignatureById = new Map<number, string>();
          const changedTaskLines: Array<string> = [];
          const nonTtyUpdateStep = Math.max(1, Math.floor(config.nonTtyUpdateStep));

          for (let i = 0; i < ordered.length; i++) {
            const taskId = ordered[i]!.snapshot.id as number;
            const snapshot = ordered[i]!.snapshot;
            const line = taskLines[i]!;
            const signature =
              snapshot.units._tag === "DeterminateTaskUnits"
                ? `${snapshot.status}:${snapshot.description}:${Math.floor(snapshot.units.completed / nonTtyUpdateStep)}:${snapshot.units.total}`
                : `${snapshot.status}:${snapshot.description}`;

            nextTaskSignatureById.set(taskId, signature);
            if (nonTTYTaskSignatureById.get(taskId) !== signature) {
              changedTaskLines.push(line);
            }
          }

          if (changedTaskLines.length > 0) {
            process.stderr.write(changedTaskLines.join("\n") + "\n");
          }

          nonTTYTaskSignatureById = nextTaskSignatureById;
        }

        if (isTTY) {
          teardownInput?.();
          process.stderr.write("\n" + SHOW_CURSOR);
        }
      }),
    ),
  );
};

const updatedSnapshot = (snapshot: TaskSnapshot, options: UpdateTaskOptions): TaskSnapshot => {
  const currentUnits = snapshot.units;
  const units = (() => {
    if (options.total !== undefined) {
      if (options.total <= 0) {
        return new IndeterminateTaskUnits({ spinnerFrame: 0 });
      }

      const completed =
        options.completed ??
        (currentUnits._tag === "DeterminateTaskUnits" ? currentUnits.completed : 0);

      return new DeterminateTaskUnits({
        completed: Math.max(0, completed),
        total: Math.max(0, options.total),
      });
    }

    if (currentUnits._tag === "DeterminateTaskUnits") {
      if (options.completed === undefined) {
        return currentUnits;
      }

      return new DeterminateTaskUnits({
        completed: Math.max(0, options.completed),
        total: currentUnits.total,
      });
    }

    return currentUnits;
  })();

  return new TaskSnapshot({
    id: snapshot.id,
    parentId: snapshot.parentId,
    description: options.description ?? snapshot.description,
    status: snapshot.status,
    transient: options.transient ?? snapshot.transient,
    units,
  });
};

export const makeProgressService = Effect.gen(function* () {
  const configOption = yield* Effect.serviceOption(ProgressBarConfig);
  const config = Option.getOrElse(configOption, () => defaultProgressBarConfig);

  const nextTaskIdRef = yield* Ref.make(0);
  const tasksRef = yield* Ref.make(new Map<TaskId, TaskSnapshot>());
  const logsRef = yield* Ref.make<ReadonlyArray<LogEntry>>([]);
  const dirtyRef = yield* Ref.make(true);
  const dirtyScheduledRef = yield* Ref.make(false);
  const nextLogIdRef = yield* Ref.make(0);
  const currentParentRef = yield* FiberRef.make(Option.none<TaskId>());

  yield* Effect.forkScoped(runProgressServiceRenderer(tasksRef, logsRef, dirtyRef, config));

  const markDirty = Effect.gen(function* () {
    const shouldSchedule = yield* Ref.modify(dirtyScheduledRef, (scheduled) =>
      scheduled ? [false, true] : [true, true],
    );

    if (!shouldSchedule) {
      return;
    }

    yield* Effect.forkDaemon(
      Effect.sleep(DIRTY_DEBOUNCE_INTERVAL).pipe(
        Effect.zipRight(Ref.set(dirtyRef, true)),
        Effect.ensuring(Ref.set(dirtyScheduledRef, false)),
      ),
    );
  });

  const addTask = (options: AddTaskOptions) =>
    Effect.gen(function* () {
      const parentId =
        options.parentId === undefined
          ? yield* FiberRef.get(currentParentRef)
          : Option.some(options.parentId);
      const taskId = TaskId(yield* Ref.updateAndGet(nextTaskIdRef, (id) => id + 1));
      const units =
        options.total === undefined || options.total <= 0
          ? new IndeterminateTaskUnits({ spinnerFrame: 0 })
          : new DeterminateTaskUnits({ completed: 0, total: Math.max(0, options.total) });

      const snapshot = new TaskSnapshot({
        id: taskId,
        parentId: Option.getOrNull(parentId),
        description: options.description,
        status: "running",
        transient: options.transient ?? false,
        units,
      });

      yield* Ref.update(tasksRef, (tasks) => {
        const next = new Map(tasks);
        next.set(taskId, snapshot);
        return next;
      });
      yield* markDirty;

      return taskId;
    });

  const updateTask = (taskId: TaskId, options: UpdateTaskOptions) =>
    Ref.update(tasksRef, (tasks) => {
      const snapshot = tasks.get(taskId);
      if (!snapshot) {
        return tasks;
      }

      const next = new Map(tasks);
      next.set(taskId, updatedSnapshot(snapshot, options));
      return next;
    }).pipe(Effect.zipRight(markDirty));

  const advanceTask = (taskId: TaskId, amount = 1) =>
    Ref.update(tasksRef, (tasks) => {
      const snapshot = tasks.get(taskId);
      if (!snapshot) {
        return tasks;
      }

      const next = new Map(tasks);
      const units =
        snapshot.units._tag === "DeterminateTaskUnits"
          ? new DeterminateTaskUnits({
              completed: Math.min(snapshot.units.total, snapshot.units.completed + amount),
              total: snapshot.units.total,
            })
          : new IndeterminateTaskUnits({
              spinnerFrame:
                (snapshot.units.spinnerFrame + amount) % Math.max(1, config.spinnerFrames.length),
            });

      next.set(
        taskId,
        new TaskSnapshot({
          id: snapshot.id,
          parentId: snapshot.parentId,
          description: snapshot.description,
          status: snapshot.status,
          transient: snapshot.transient,
          units,
        }),
      );

      return next;
    }).pipe(Effect.zipRight(markDirty));

  const completeTask = (taskId: TaskId) =>
    Ref.update(tasksRef, (tasks) => {
      const snapshot = tasks.get(taskId);
      if (!snapshot) {
        return tasks;
      }

      const next = new Map(tasks);
      if (snapshot.transient) {
        next.delete(taskId);
        return next;
      }

      next.set(
        taskId,
        new TaskSnapshot({
          id: snapshot.id,
          parentId: snapshot.parentId,
          description: snapshot.description,
          status: "done",
          transient: snapshot.transient,
          units:
            snapshot.units._tag === "DeterminateTaskUnits"
              ? new DeterminateTaskUnits({
                  completed: snapshot.units.total,
                  total: snapshot.units.total,
                })
              : snapshot.units,
        }),
      );
      return next;
    }).pipe(Effect.zipRight(markDirty));

  const failTask = (taskId: TaskId) =>
    Ref.update(tasksRef, (tasks) => {
      const snapshot = tasks.get(taskId);
      if (!snapshot) {
        return tasks;
      }

      const next = new Map(tasks);
      if (snapshot.transient) {
        next.delete(taskId);
        return next;
      }

      next.set(
        taskId,
        new TaskSnapshot({
          id: snapshot.id,
          parentId: snapshot.parentId,
          description: snapshot.description,
          status: "failed",
          transient: snapshot.transient,
          units: snapshot.units,
        }),
      );
      return next;
    }).pipe(Effect.zipRight(markDirty));

  const log = (...args: ReadonlyArray<unknown>) =>
    Effect.gen(function* () {
      const id = yield* Ref.updateAndGet(nextLogIdRef, (current) => current + 1);
      const message = formatWithOptions(
        {
          colors: config.isTTY,
          depth: 6,
        },
        ...args,
      );

      yield* Ref.update(logsRef, (logs) => {
        const maxLogLines = Math.floor(config.maxLogLines);
        const next = [...logs, { id, message }];
        if (maxLogLines <= 0) {
          return next;
        }
        if (next.length <= maxLogLines) {
          return next;
        }
        return next.slice(next.length - maxLogLines);
      });
      yield* markDirty;
    });

  const getTask = (taskId: TaskId) =>
    Ref.get(tasksRef).pipe(Effect.map((tasks) => Option.fromNullable(tasks.get(taskId))));

  const listTasks = Ref.get(tasksRef).pipe(Effect.map((tasks) => Array.from(tasks.values())));

  const withTask: ProgressService["withTask"] = (options, effect) =>
    Effect.gen(function* () {
      const inheritedParentId = yield* FiberRef.get(currentParentRef);
      const resolvedParentId =
        options.parentId === undefined ? inheritedParentId : Option.some(options.parentId);

      const taskId = yield* addTask({
        ...options,
        parentId: Option.isSome(resolvedParentId) ? resolvedParentId.value : undefined,
        transient: options.transient ?? Option.isSome(resolvedParentId),
      });

      const exit = yield* Effect.exit(
        Effect.locally(effect(taskId), currentParentRef, Option.some(taskId)),
      );

      if (Exit.isSuccess(exit)) {
        yield* completeTask(taskId);
      } else {
        yield* failTask(taskId);
      }

      return yield* Exit.match(exit, {
        onFailure: Effect.failCause,
        onSuccess: Effect.succeed,
      });
    });

  const trackIterable: ProgressService["trackIterable"] = (iterable, options, f) =>
    withTask(
      {
        description: options.description,
        total: options.total ?? inferTotal(iterable),
        transient: options.transient,
      },
      (taskId) => {
        const items = Array.from(iterable);
        return Effect.forEach(items, (item, index) =>
          Effect.tap(f(item, index), () => advanceTask(taskId, 1)),
        );
      },
    );

  const service: ProgressService = {
    addTask,
    updateTask,
    advanceTask,
    completeTask,
    failTask,
    log,
    getTask,
    listTasks,
    withTask,
    trackIterable,
  };

  return service;
});

export interface TrackEffectsOptions {
  readonly description: string;
  readonly total?: number;
  readonly transient?: boolean;
  readonly all?: {
    readonly concurrency?: number | "unbounded";
    readonly batching?: boolean | "inherit";
    readonly concurrentFinalizers?: boolean;
  };
}

export const trackProgress = <A, E, R>(
  effects: ReadonlyArray<Effect.Effect<A, E, R>>,
  options: TrackEffectsOptions,
): Effect.Effect<ReadonlyArray<A>, E, R> =>
  withProgressService(
    Effect.gen(function* () {
      const progress = yield* Progress;
      return yield* progress.withTask(
        {
          description: options.description,
          total: options.total ?? effects.length,
          transient: options.transient,
        },
        (taskId) =>
          Effect.forEach(
            effects.map((effect) => Effect.tap(effect, () => progress.advanceTask(taskId, 1))),
            (effect) => effect,
            {
              concurrency: options.all?.concurrency,
              batching: options.all?.batching,
              concurrentFinalizers: options.all?.concurrentFinalizers,
            },
          ),
      );
    }),
  );

export const track = <A, B, E, R>(
  iterable: Iterable<A>,
  options: TrackOptions,
  f: (item: A, index: number) => Effect.Effect<B, E, R>,
): Effect.Effect<ReadonlyArray<B>, E, R> =>
  withProgressService(
    Effect.gen(function* () {
      const progress = yield* Progress;
      return yield* progress.trackIterable(iterable, options, f);
    }),
  );

const makeProgressConsole = (
  progress: ProgressService,
  outerConsole: Console.Console,
): Console.Console => {
  const log = (...args: ReadonlyArray<unknown>) => progress.log(...args);
  const unsafeLog = (...args: ReadonlyArray<unknown>) => {
    Effect.runFork(progress.log(...args));
  };

  const delegate = (effect: Effect.Effect<void, never, never>) => effect;

  return {
    [Console.TypeId]: Console.TypeId,
    assert(condition, ...args) {
      return condition ? Effect.void : log("Assertion failed:", ...args);
    },
    clear: Effect.void,
    count: (_label) => Effect.void,
    countReset: (_label) => Effect.void,
    debug: (...args) => log(...args),
    dir: (item, options) => log(formatWithOptions(options ?? {}, "%O", item)),
    dirxml: (...args) => log(...args),
    error: (...args) => log(...args),
    group: (...args) => log(...args),
    groupEnd: Effect.void,
    info: (...args) => log(...args),
    log: (...args) => log(...args),
    table: (tabularData, properties) => log(tabularData, properties),
    time: (_label) => Effect.void,
    timeEnd: (_label) => Effect.void,
    timeLog: (_label, ...args) => log(...args),
    trace: (...args) => delegate(outerConsole.trace(...args)),
    warn: (...args) => log(...args),
    unsafe: {
      assert(condition, ...args) {
        if (!condition) unsafeLog("Assertion failed:", ...args);
      },
      clear() {},
      count(_label) {},
      countReset(_label) {},
      debug(...args) {
        unsafeLog(...args);
      },
      dir(item, options) {
        unsafeLog(formatWithOptions(options ?? {}, "%O", item));
      },
      dirxml(...args) {
        unsafeLog(...args);
      },
      error(...args) {
        unsafeLog(...args);
      },
      group(...args) {
        unsafeLog(...args);
      },
      groupCollapsed(...args) {
        unsafeLog(...args);
      },
      groupEnd() {},
      info(...args) {
        unsafeLog(...args);
      },
      log(...args) {
        unsafeLog(...args);
      },
      table(tabularData, properties) {
        unsafeLog(tabularData, properties);
      },
      time(_label) {},
      timeEnd(_label) {},
      timeLog(_label, ...args) {
        unsafeLog(...args);
      },
      trace(...args) {
        outerConsole.unsafe.trace(...args);
      },
      warn(...args) {
        unsafeLog(...args);
      },
    },
  };
};

export const withProgressService = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const outerConsole = yield* Console.consoleWith((console) => Effect.succeed(console));
    const existing = yield* Effect.serviceOption(Progress);
    if (Option.isSome(existing)) {
      const console = makeProgressConsole(existing.value, outerConsole);
      return yield* Effect.withConsole(
        Effect.provideService(effect, Progress, existing.value),
        console,
      );
    }

    return yield* Effect.scoped(
      Effect.gen(function* () {
        const service = yield* makeProgressService;
        const console = makeProgressConsole(service, outerConsole);
        return yield* Effect.withConsole(Effect.provideService(effect, Progress, service), console);
      }),
    );
  });

export const isIndeterminateTask = (snapshot: TaskSnapshot) =>
  snapshot.units._tag === "IndeterminateTaskUnits";

export const nextSpinnerFrame = (index: number) => (index + 1) % SPINNER_FRAMES.length;
