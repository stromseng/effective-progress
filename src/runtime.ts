import { Clock, Context, Effect, Exit, FiberRef, Layer, Option, Ref } from "effect";
import { dual } from "effect/Function";
import { mergeWith } from "es-toolkit/object";
import { formatWithOptions } from "node:util";
import type { PartialDeep } from "type-fest";
import { Colorizer, type ColorizerService } from "./colors";
import { makeProgressConsole } from "./console";
import { runProgressServiceRenderer } from "./renderer";
import { ProgressTerminal } from "./terminal";
import type {
  AddTaskOptions,
  ProgressService,
  RenderRow,
  TaskStore,
  UpdateTaskOptions,
} from "./types";
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
    config: snapshot.config,
    startedAt: snapshot.startedAt,
    completedAt: snapshot.completedAt,
  });
};

const findInsertionIndex = (
  renderOrder: ReadonlyArray<RenderRow>,
  parentId: TaskId | null,
): { index: number; depth: number } => {
  if (parentId === null) {
    return { index: renderOrder.length, depth: 0 };
  }
  const parentIdx = renderOrder.findIndex((row) => row.id === parentId);
  if (parentIdx === -1) return { index: renderOrder.length, depth: 0 };
  const parentDepth = renderOrder[parentIdx]!.depth;
  let i = parentIdx + 1;
  while (i < renderOrder.length && renderOrder[i]!.depth > parentDepth) i++;
  return { index: i, depth: parentDepth + 1 };
};

const removeFromRenderOrder = (
  renderOrder: ReadonlyArray<RenderRow>,
  taskId: TaskId,
): ReadonlyArray<RenderRow> => {
  const idx = renderOrder.findIndex((row) => row.id === taskId);
  if (idx === -1) return renderOrder;
  const taskDepth = renderOrder[idx]!.depth;
  let end = idx + 1;
  while (end < renderOrder.length && renderOrder[end]!.depth > taskDepth) end++;
  const next = [...renderOrder];
  next.splice(idx, end - idx);
  return next;
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
  const storeRef = yield* Ref.make<TaskStore>({
    tasks: new Map<TaskId, TaskSnapshot>(),
    renderOrder: [],
    colorizers: new Map<TaskId, ColorizerService>(),
  });
  const logsRef = yield* Ref.make<ReadonlyArray<string>>([]);
  const pendingLogsRef = yield* Ref.make<ReadonlyArray<string>>([]);
  const dirtyRef = yield* Ref.make(true);
  const currentParentRef = yield* FiberRef.make(Option.none<TaskId>());
  const scope = yield* Effect.scope;

  yield* Effect.forkIn(
    runProgressServiceRenderer(
      storeRef,
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
      const resolvedParentId =
        options.parentId === undefined
          ? yield* FiberRef.get(currentParentRef)
          : Option.some(options.parentId);
      const colorizerOption = yield* Effect.serviceOption(Colorizer);
      const taskId = TaskId(yield* Ref.updateAndGet(nextTaskIdRef, (id) => id + 1));
      const units =
        options.total === undefined || options.total <= 0
          ? new IndeterminateTaskUnits({ spinnerFrame: 0 })
          : new DeterminateTaskUnits({ completed: 0, total: Math.max(0, options.total) });
      const store = yield* Ref.get(storeRef);
      const parentSnapshot = Option.isSome(resolvedParentId)
        ? store.tasks.get(resolvedParentId.value)
        : undefined;
      const inheritedProgressBarConfig = parentSnapshot?.config ?? progressBarConfig;
      const resolvedProgressBarConfig = decodeProgressBarConfigSync(
        mergeConfig(inheritedProgressBarConfig, options.progressbar),
      );

      const now = yield* Clock.currentTimeMillis;
      const parentIdValue = Option.getOrNull(resolvedParentId);
      const snapshot = new TaskSnapshot({
        id: taskId,
        parentId: parentIdValue,
        description: options.description,
        status: "running",
        transient: options.transient ?? false,
        units,
        config: resolvedProgressBarConfig,
        startedAt: now,
        completedAt: null,
      });

      yield* Ref.update(storeRef, (s) => {
        const nextTasks = new Map(s.tasks);
        nextTasks.set(taskId, snapshot);
        const { index, depth } = findInsertionIndex(s.renderOrder, parentIdValue);
        const nextOrder = [...s.renderOrder];
        nextOrder.splice(index, 0, { id: taskId, depth });
        const nextColorizers = new Map(s.colorizers);
        if (Option.isSome(colorizerOption)) {
          nextColorizers.set(taskId, colorizerOption.value);
        }
        return { tasks: nextTasks, renderOrder: nextOrder, colorizers: nextColorizers };
      });
      yield* markDirty;

      return taskId;
    });

  const updateTask = (taskId: TaskId, options: UpdateTaskOptions) =>
    Ref.update(storeRef, (store) => {
      const snapshot = store.tasks.get(taskId);
      if (!snapshot) return store;
      const nextTasks = new Map(store.tasks);
      nextTasks.set(taskId, updatedSnapshot(snapshot, options));
      return { tasks: nextTasks, renderOrder: store.renderOrder, colorizers: store.colorizers };
    }).pipe(Effect.zipRight(markDirty));

  const advanceTask = (taskId: TaskId, amount = 1) =>
    Ref.update(storeRef, (store) => {
      const snapshot = store.tasks.get(taskId);
      if (!snapshot) return store;

      const units =
        snapshot.units._tag === "DeterminateTaskUnits"
          ? new DeterminateTaskUnits({
              completed: Math.min(snapshot.units.total, snapshot.units.completed + amount),
              total: snapshot.units.total,
            })
          : new IndeterminateTaskUnits({
              spinnerFrame: Math.max(0, snapshot.units.spinnerFrame + amount),
            });

      const nextTasks = new Map(store.tasks);
      nextTasks.set(
        taskId,
        new TaskSnapshot({
          id: snapshot.id,
          parentId: snapshot.parentId,
          description: snapshot.description,
          status: snapshot.status,
          transient: snapshot.transient,
          units,
          config: snapshot.config,
          startedAt: snapshot.startedAt,
          completedAt: snapshot.completedAt,
        }),
      );

      return { tasks: nextTasks, renderOrder: store.renderOrder, colorizers: store.colorizers };
    }).pipe(Effect.zipRight(markDirty));

  const completeTask = (taskId: TaskId) =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      yield* Ref.update(storeRef, (store) => {
        const snapshot = store.tasks.get(taskId);
        if (!snapshot) return store;

        const nextTasks = new Map(store.tasks);
        if (snapshot.transient) {
          nextTasks.delete(taskId);
          const nextColorizers = new Map(store.colorizers);
          nextColorizers.delete(taskId);
          return {
            tasks: nextTasks,
            renderOrder: removeFromRenderOrder(store.renderOrder, taskId),
            colorizers: nextColorizers,
          };
        }

        nextTasks.set(
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
            config: snapshot.config,
            startedAt: snapshot.startedAt,
            completedAt: now,
          }),
        );
        return { tasks: nextTasks, renderOrder: store.renderOrder, colorizers: store.colorizers };
      });
      yield* markDirty;
    });

  const failTask = (taskId: TaskId) =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      yield* Ref.update(storeRef, (store) => {
        const snapshot = store.tasks.get(taskId);
        if (!snapshot) return store;

        const nextTasks = new Map(store.tasks);
        if (snapshot.transient) {
          nextTasks.delete(taskId);
          const nextColorizers = new Map(store.colorizers);
          nextColorizers.delete(taskId);
          return {
            tasks: nextTasks,
            renderOrder: removeFromRenderOrder(store.renderOrder, taskId),
            colorizers: nextColorizers,
          };
        }

        nextTasks.set(
          taskId,
          new TaskSnapshot({
            id: snapshot.id,
            parentId: snapshot.parentId,
            description: snapshot.description,
            status: "failed",
            transient: snapshot.transient,
            units: snapshot.units,
            config: snapshot.config,
            startedAt: snapshot.startedAt,
            completedAt: now,
          }),
        );
        return { tasks: nextTasks, renderOrder: store.renderOrder, colorizers: store.colorizers };
      });
      yield* markDirty;
    });

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
    Ref.get(storeRef).pipe(Effect.map((store) => Option.fromNullable(store.tasks.get(taskId))));

  const listTasks = Ref.get(storeRef).pipe(Effect.map((store) => Array.from(store.tasks.values())));

  const runTask: ProgressService["runTask"] = dual(
    2,
    <A, E, R>(effect: Effect.Effect<A, E, R>, options: AddTaskOptions) =>
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

        return yield* Effect.locally(
          Effect.withConsole(
            Effect.provideService(effect, Task, taskId),
            makeProgressConsole(log, outerConsole),
          ),
          currentParentRef,
          Option.some(taskId),
        );
      }),
  );

  const withTask: ProgressService["withTask"] = dual(
    2,
    <A, E, R>(effect: Effect.Effect<A, E, R>, options: AddTaskOptions) =>
      runTask(
        Effect.gen(function* () {
          const taskId = yield* Task;
          const exit = yield* Effect.exit(effect);

          if (Exit.isSuccess(exit)) {
            yield* completeTask(taskId);
          } else {
            yield* failTask(taskId);
          }

          return yield* Exit.match(exit, {
            onFailure: Effect.failCause,
            onSuccess: Effect.succeed,
          });
        }),
        options,
      ),
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
    runTask,
    withTask,
  };

  return Progress.of(service);
});

export class Progress extends Context.Tag("stromseng.dev/effective-progress/Progress")<
  Progress,
  ProgressService
>() {
  static readonly Default = Layer.unwrapEffect(
    Effect.gen(function* () {
      const colorizerOption = yield* Effect.serviceOption(Colorizer);
      const terminalOption = yield* Effect.serviceOption(ProgressTerminal);
      const base = Layer.scoped(Progress, makeProgressService);
      return base.pipe(
        Option.isNone(colorizerOption) ? Layer.provide(Colorizer.Default) : (l) => l,
        Option.isNone(terminalOption) ? Layer.provide(ProgressTerminal.Default) : (l) => l,
      );
    }),
  );
}
