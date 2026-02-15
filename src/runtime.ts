import { Context, Effect, Exit, FiberRef, Layer, Option, Ref } from "effect";
import { mergeWith } from "es-toolkit/object";
import { formatWithOptions } from "node:util";
import type { PartialDeep } from "type-fest";
import { makeProgressConsole } from "./console";
import { runProgressServiceRenderer } from "./renderer";
import { ProgressTerminal } from "./terminal";
import type { AddTaskOptions, ProgressService, UpdateTaskOptions } from "./types";
import {
  decodeProgressBarConfigSync,
  decodeRendererConfigSync,
  defaultProgressBarConfig,
  defaultRendererConfig,
  DeterminateTaskUnits,
  IndeterminateTaskUnits,
  ProgressBarConfig,
  RendererConfig,
  Task,
  TaskId,
  TaskSnapshot,
} from "./types";
import { inferTotal } from "./utils";

const mergeConfig = <T extends Record<PropertyKey, any>>(
  base: T,
  override: PartialDeep<T> | undefined,
): T =>
  mergeWith(
    structuredClone(base),
    (override ?? {}) as Record<PropertyKey, any>,
    (_targetValue, sourceValue) => {
      if (Array.isArray(sourceValue)) {
        return sourceValue;
      }
      return undefined;
    },
  ) as T;

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
    progressbar: snapshot.progressbar,
  });
};

const makeProgressService = Effect.gen(function* () {
  const rendererConfigOption = yield* Effect.serviceOption(RendererConfig);
  const progressBarConfigOption = yield* Effect.serviceOption(ProgressBarConfig);

  const rendererConfig = decodeRendererConfigSync(
    mergeConfig(
      defaultRendererConfig,
      Option.isSome(rendererConfigOption) ? rendererConfigOption.value : undefined,
    ),
  );
  const progressBarConfig = decodeProgressBarConfigSync(
    mergeConfig(
      defaultProgressBarConfig,
      Option.isSome(progressBarConfigOption) ? progressBarConfigOption.value : undefined,
    ),
  );
  const terminal = yield* ProgressTerminal;
  const isTTY = yield* terminal.isTTY;
  const maxRetainedLogLines = Math.max(0, Math.floor(rendererConfig.maxLogLines ?? 0));

  const nextTaskIdRef = yield* Ref.make(0);
  const tasksRef = yield* Ref.make(new Map<TaskId, TaskSnapshot>());
  const logsRef = yield* Ref.make<ReadonlyArray<string>>([]);
  const pendingLogsRef = yield* Ref.make<ReadonlyArray<string>>([]);
  const dirtyRef = yield* Ref.make(true);
  const currentParentRef = yield* FiberRef.make(Option.none<TaskId>());
  const scope = yield* Effect.scope;

  yield* Effect.forkIn(
    runProgressServiceRenderer(
      tasksRef,
      logsRef,
      pendingLogsRef,
      dirtyRef,
      terminal,
      isTTY,
      rendererConfig,
      maxRetainedLogLines,
    ),
    scope,
  );

  const markDirty = Ref.set(dirtyRef, true);

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
      const tasks = yield* Ref.get(tasksRef);
      const parentSnapshot = Option.isSome(parentId) ? tasks.get(parentId.value) : undefined;
      const inheritedProgressBarConfig = parentSnapshot?.progressbar ?? progressBarConfig;
      const resolvedProgressBarConfig = decodeProgressBarConfigSync(
        mergeConfig(inheritedProgressBarConfig, options.progressbar),
      );

      const snapshot = new TaskSnapshot({
        id: taskId,
        parentId: Option.getOrNull(parentId),
        description: options.description,
        status: "running",
        transient: options.transient ?? false,
        units,
        progressbar: resolvedProgressBarConfig,
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
              spinnerFrame: Math.max(0, snapshot.units.spinnerFrame + amount),
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
          progressbar: snapshot.progressbar,
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
          progressbar: snapshot.progressbar,
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
          progressbar: snapshot.progressbar,
        }),
      );
      return next;
    }).pipe(Effect.zipRight(markDirty));

  const appendLog = (args: ReadonlyArray<unknown>) =>
    Effect.gen(function* () {
      if (args.length === 0) {
        return;
      }

      // TODO: Might wanna replace this or make it configurable. Look for other options.
      const message = formatWithOptions(
        {
          colors: isTTY,
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

  const log = (...args: ReadonlyArray<unknown>) => appendLog(args);

  const getTask = (taskId: TaskId) =>
    Ref.get(tasksRef).pipe(Effect.map((tasks) => Option.fromNullable(tasks.get(taskId))));

  const listTasks = Ref.get(tasksRef).pipe(Effect.map((tasks) => Array.from(tasks.values())));

  const withTask: ProgressService["withTask"] = (options, effect) =>
    Effect.gen(function* () {
      const outerConsole = yield* Effect.console;
      const inheritedParentId = yield* FiberRef.get(currentParentRef);
      const resolvedParentId =
        options.parentId === undefined ? inheritedParentId : Option.some(options.parentId);

      const taskId = yield* addTask({
        ...options,
        parentId: Option.isSome(resolvedParentId) ? resolvedParentId.value : undefined,
        transient: options.transient ?? Option.isSome(resolvedParentId),
      });

      const exit = yield* Effect.exit(
        Effect.locally(
          Effect.withConsole(
            Effect.provideService(effect, Task, taskId),
            makeProgressConsole(log, outerConsole),
          ),
          currentParentRef,
          Option.some(taskId),
        ),
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
        progressbar: options.progressbar,
      },
      Effect.gen(function* () {
        const taskId = yield* Task;
        return yield* Effect.forEach(iterable, (item, index) =>
          Effect.tap(f(item, index), () => advanceTask(taskId, 1)),
        );
      }),
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

  return Progress.of(service);
});

export class Progress extends Context.Tag("stromseng.dev/Progress")<Progress, ProgressService>() {
  static readonly Default = Layer.scoped(Progress, makeProgressService);
}

export const provideProgressService = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const existing = yield* Effect.serviceOption(Progress);
    if (Option.isSome(existing)) {
      return yield* Effect.provideService(effect, Progress, existing.value);
    }

    const existingTerminal = yield* Effect.serviceOption(ProgressTerminal);
    if (Option.isSome(existingTerminal)) {
      return yield* Effect.scoped(effect.pipe(Effect.provide(Progress.Default)));
    }

    const defaultLayers = Layer.provide(Progress.Default, ProgressTerminal.Default);
    return yield* Effect.scoped(effect.pipe(Effect.provide(defaultLayers)));
  });
