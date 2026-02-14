import { Effect, Exit, FiberRef, Option, Ref } from "effect";
import { formatWithOptions } from "node:util";
import { runProgressServiceRenderer } from "./renderer";
import type { AddTaskOptions, ProgressService, UpdateTaskOptions } from "./types";
import {
  decodeProgressConfigSync,
  defaultProgressConfig,
  DeterminateTaskUnits,
  IndeterminateTaskUnits,
  Progress,
  ProgressConfig,
  TaskId,
  TaskSnapshot,
} from "./types";
import { inferTotal } from "./utils";

const DIRTY_DEBOUNCE_INTERVAL = "10 millis";

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
  const configOption = yield* Effect.serviceOption(ProgressConfig);
  const config = decodeProgressConfigSync(Option.getOrElse(configOption, () => defaultProgressConfig));
  const maxRetainedLogLines = Math.max(0, Math.floor(config.renderer.maxLogLines ?? 0));

  const nextTaskIdRef = yield* Ref.make(0);
  const tasksRef = yield* Ref.make(new Map<TaskId, TaskSnapshot>());
  const logsRef = yield* Ref.make<ReadonlyArray<string>>([]);
  const pendingLogsRef = yield* Ref.make<ReadonlyArray<string>>([]);
  const dirtyRef = yield* Ref.make(true);
  const dirtyScheduledRef = yield* Ref.make(false);
  const currentParentRef = yield* FiberRef.make(Option.none<TaskId>());

  yield* Effect.forkScoped(
    runProgressServiceRenderer(
      tasksRef,
      logsRef,
      pendingLogsRef,
      dirtyRef,
      config,
      maxRetainedLogLines,
    ),
  );

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
                (snapshot.units.spinnerFrame + amount) %
                Math.max(1, config.progressbar.spinnerFrames.length),
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
      if (args.length === 0) {
        return;
      }

      const message = formatWithOptions(
        {
          colors: config.renderer.isTTY,
          depth: 6,
        },
        ...args,
      );

      yield* Ref.update(pendingLogsRef, (logs) => [...logs, message]);
      if (maxRetainedLogLines > 0) {
        yield* Ref.update(logsRef, (logs) => {
          const next = [...logs, message];
          if (next.length <= maxRetainedLogLines) {
            return next;
          }
          return next.slice(next.length - maxRetainedLogLines);
        });
      }

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
        return Effect.forEach(iterable, (item, index) =>
          Effect.tap(f(item, index), () => advanceTask(taskId, 1)),
        );
      },
    );

  return Progress.of({
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
  });
});
