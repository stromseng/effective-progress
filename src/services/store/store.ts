import { Clock, Context, Effect, Layer, Option, Queue } from "effect";
import type {
  AddTaskOptions,
  ColumnDef,
  TaskProgressSample,
  TaskId,
  TaskStore,
  TaskOperations,
  UpdateTaskOptions,
} from "../../types";
import { TaskId as makeTaskId, type TaskSnapshot } from "../../types";

interface TaskCounts {
  readonly succeeded: number;
  readonly failed: number;
  readonly total?: number;
}

const ETA_SAMPLE_WINDOW_MILLIS = 30_000;
const ETA_SAMPLE_MAX_LENGTH = 1_000;

export interface ProgressStoreService extends TaskOperations {
  readonly getSnapshot: () => TaskStore;
  readonly subscribe: (listener: () => void) => () => void;
  readonly flush: () => void;
}

const hasExplicitTotal = (options: Pick<AddTaskOptions | UpdateTaskOptions, "total">) =>
  Object.prototype.hasOwnProperty.call(options, "total");

const sanitizeTotal = (total: number | undefined) => {
  if (total === undefined) {
    return undefined;
  }

  return !Number.isFinite(total) || total < 0 ? undefined : total;
};

const normalizeUnits = (counts: TaskCounts) => {
  const succeeded = Math.max(0, counts.succeeded);
  const failed = Math.max(0, counts.failed);

  return counts.total === undefined
    ? {
        succeeded,
        failed,
        processed: succeeded + failed,
      }
    : {
        succeeded,
        failed,
        processed: succeeded + failed,
        total: counts.total,
      };
};

/** Completes remaining known work, or records the observed total for an unknown-total task. */
const completedUnits = (units: TaskSnapshot["units"]): TaskSnapshot["units"] => {
  if (units.total === undefined) {
    return units.processed > 0 ? normalizeUnits({ ...units, total: units.processed }) : units;
  }

  return units.processed < units.total
    ? normalizeUnits({
        ...units,
        succeeded: units.succeeded + (units.total - units.processed),
      })
    : units;
};

/**
 * Returns a new progress sample deque with the latest processed count appended.
 *
 * Samples are retained for the ETA rolling window and capped by count so very chatty tasks do not
 * grow memory without bound.
 */
const appendProgressSample = (
  samples: ReadonlyArray<TaskProgressSample> | undefined,
  now: number,
  processed: number,
): ReadonlyArray<TaskProgressSample> => {
  const previousSamples = samples ?? [];
  const lastSample = previousSamples.at(-1);
  if (lastSample?.processed === processed) {
    return previousSamples;
  }

  // Keep one sample immediately before the rolling window when possible. That gives the ETA
  // calculation a usable delta even just after old samples age out of the 30s window.
  const windowStart = now - ETA_SAMPLE_WINDOW_MILLIS;
  const appendedLength = previousSamples.length + 1;
  let firstRetainedIndex = Math.max(0, appendedLength - ETA_SAMPLE_MAX_LENGTH);
  while (
    firstRetainedIndex + 1 < previousSamples.length &&
    previousSamples[firstRetainedIndex + 1]!.timestamp < windowStart
  ) {
    firstRetainedIndex++;
  }

  return [...previousSamples.slice(firstRetainedIndex), { timestamp: now, processed }];
};

/** Applies mutable task fields and records a progress sample when the processed count changes. */
const updatedSnapshot = (snapshot: TaskSnapshot, options: UpdateTaskOptions, now: number) => {
  const currentUnits = snapshot.units;
  const units =
    options.succeeded === undefined &&
    options.failed === undefined &&
    options.total === undefined &&
    !hasExplicitTotal(options)
      ? currentUnits
      : normalizeUnits({
          succeeded: options.succeeded ?? currentUnits.succeeded,
          failed: options.failed ?? currentUnits.failed,
          total: hasExplicitTotal(options) ? sanitizeTotal(options.total) : currentUnits.total,
        });

  return {
    ...snapshot,
    description: options.description ?? snapshot.description,
    countDisplay: options.countDisplay ?? snapshot.countDisplay,
    units,
    progressSamples: appendProgressSample(snapshot.progressSamples, now, units.processed),
  } satisfies TaskSnapshot;
};

const findInsertionIndex = (
  renderOrder: ReadonlyArray<TaskStore["renderOrder"][number]>,
  parentId: TaskId | null,
) => {
  if (parentId === null) {
    return { index: renderOrder.length, depth: 0 };
  }

  const parentIdx = renderOrder.findIndex((row) => row.id === parentId);
  if (parentIdx === -1) {
    return { index: renderOrder.length, depth: 0 };
  }

  const parentDepth = renderOrder[parentIdx]!.depth;
  let i = parentIdx + 1;
  while (i < renderOrder.length && renderOrder[i]!.depth > parentDepth) {
    i++;
  }

  return { index: i, depth: parentDepth + 1 };
};

/** Finds the half-open range containing a task and all of its descendants. */
const findSubtreeRange = (renderOrder: TaskStore["renderOrder"], taskId: TaskId) => {
  const start = renderOrder.findIndex((row) => row.id === taskId);
  if (start === -1) {
    return undefined;
  }

  const taskDepth = renderOrder[start]!.depth;
  let end = start + 1;
  while (end < renderOrder.length && renderOrder[end]!.depth > taskDepth) {
    end++;
  }

  return { start, end };
};

const removeTransientSubtree = (
  current: TaskStore,
  nextTasks: Map<TaskId, TaskSnapshot>,
  taskId: TaskId,
) => {
  const range = findSubtreeRange(current.renderOrder, taskId);
  const removedTaskIds =
    range === undefined
      ? []
      : current.renderOrder.slice(range.start, range.end).map((row) => row.id);
  for (const removedTaskId of removedTaskIds) {
    nextTasks.delete(removedTaskId);
  }

  const nextColumns = new Map(current.columns);
  for (const removedTaskId of removedTaskIds) {
    nextColumns.delete(removedTaskId);
  }

  return {
    renderOrder:
      range === undefined
        ? current.renderOrder
        : current.renderOrder.toSpliced(range.start, range.end - range.start),
    columns: nextColumns,
  };
};

const SNAPSHOT_PUBLISH_INTERVAL_MILLIS = 100;

interface ProgressStoreRuntime {
  readonly store: ProgressStoreService;
  readonly publisherLoop: Effect.Effect<never>;
}

const makeProgressStoreRuntime = (publishQueue: Queue.Queue<void>): ProgressStoreRuntime => {
  let nextTaskId = 0;
  let state: TaskStore = {
    tasks: new Map<TaskId, TaskSnapshot>(),
    renderOrder: [],
    columns: new Map<TaskId, ReadonlyArray<ColumnDef<any, any>>>(),
  };
  let publishedSnapshot = state;
  let hasPendingPublish = false;
  let lastPublishAt = -SNAPSHOT_PUBLISH_INTERVAL_MILLIS;
  let latestObservedAt = 0;
  const listeners = new Set<() => void>();

  const notifyListeners = (): void => {
    for (const listener of listeners) {
      listener();
    }
  };

  const publishNow = (publishedAt: number): void => {
    hasPendingPublish = false;
    publishedSnapshot = state;
    notifyListeners();
    lastPublishAt = publishedAt;
  };

  const publisherLoop = Effect.forever(
    Effect.gen(function* () {
      yield* Queue.take(publishQueue);

      const now = yield* Clock.currentTimeMillis;
      const waitMillis = Math.max(0, SNAPSHOT_PUBLISH_INTERVAL_MILLIS - (now - lastPublishAt));
      if (waitMillis > 0) {
        yield* Effect.sleep(waitMillis);
      }
      if (!hasPendingPublish) {
        return;
      }

      const publishAt = yield* Clock.currentTimeMillis;
      publishNow(publishAt);
    }),
  );

  const schedulePublish: Effect.Effect<void> = Effect.gen(function* () {
    if (!hasPendingPublish) {
      return;
    }

    const now = yield* Clock.currentTimeMillis;
    const waitMillis = Math.max(0, SNAPSHOT_PUBLISH_INTERVAL_MILLIS - (now - lastPublishAt));
    if (waitMillis === 0) {
      publishNow(now);
      return;
    }

    yield* Queue.offer(publishQueue, undefined);
  });

  const updateState = (
    transform: (current: TaskStore) => TaskStore,
    now: number,
  ): Effect.Effect<void> => {
    const nextState = transform(state);
    if (nextState === state) {
      return Effect.void;
    }

    latestObservedAt = now;
    state = nextState;
    hasPendingPublish = true;
    return schedulePublish;
  };

  const incrementCounter = (taskId: TaskId, kind: "succeeded" | "failed", amount: number) =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;

      yield* updateState((current) => {
        const currentTask = current.tasks.get(taskId);
        if (!currentTask) {
          return current;
        }

        const units = normalizeUnits({
          succeeded: currentTask.units.succeeded,
          failed: currentTask.units.failed,
          [kind]: currentTask.units[kind] + amount,
          total: currentTask.units.total,
        });
        const nextTasks = new Map(current.tasks);
        nextTasks.set(taskId, {
          ...currentTask,
          units,
          progressSamples: appendProgressSample(currentTask.progressSamples, now, units.processed),
        } satisfies TaskSnapshot);

        return { tasks: nextTasks, renderOrder: current.renderOrder, columns: current.columns };
      }, now);
    });

  const finalizeTask = (taskId: TaskId, status: "done" | "failed") =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;

      yield* updateState((current) => {
        const currentTask = current.tasks.get(taskId);
        if (!currentTask || currentTask.status !== "running") {
          return current;
        }

        const nextTasks = new Map(current.tasks);
        if (currentTask.transient) {
          const removedSubtree = removeTransientSubtree(current, nextTasks, taskId);

          return {
            tasks: nextTasks,
            renderOrder: removedSubtree.renderOrder,
            columns: removedSubtree.columns,
          };
        }

        const units = status === "done" ? completedUnits(currentTask.units) : currentTask.units;
        nextTasks.set(taskId, {
          ...currentTask,
          status,
          units,
          completedAt: now,
          progressSamples:
            status === "done"
              ? appendProgressSample(currentTask.progressSamples, now, units.processed)
              : currentTask.progressSamples,
        } satisfies TaskSnapshot);

        return { tasks: nextTasks, renderOrder: current.renderOrder, columns: current.columns };
      }, now);
    });

  const store: ProgressStoreService = {
    getSnapshot: () => publishedSnapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    flush: () => {
      if (!hasPendingPublish) {
        return;
      }
      publishNow(latestObservedAt);
    },
    addTask: (options) =>
      Effect.gen(function* () {
        const taskId = makeTaskId(++nextTaskId);
        const units = normalizeUnits({
          succeeded: 0,
          failed: 0,
          total: sanitizeTotal(options.total),
        });
        const parentSnapshot =
          options.parentId === undefined ? undefined : state.tasks.get(options.parentId);
        const now = yield* Clock.currentTimeMillis;
        const parentId = options.parentId ?? null;
        const countDisplay = options.countDisplay ?? parentSnapshot?.countDisplay ?? "detailed";
        const task = {
          id: taskId,
          parentId,
          description: options.description,
          status: "running",
          countDisplay,
          transient: (parentSnapshot?.transient ?? false) || (options.transient ?? false),
          units,
          startedAt: now,
          completedAt: null,
          progressSamples: [{ timestamp: now, processed: units.processed }],
          metadata: options.metadata,
        } satisfies TaskSnapshot;

        yield* updateState((current) => {
          const nextTasks = new Map(current.tasks);
          nextTasks.set(taskId, task);
          const { index, depth } = findInsertionIndex(current.renderOrder, parentId);
          const nextRenderOrder = [...current.renderOrder];
          nextRenderOrder.splice(index, 0, { id: taskId, depth });

          const nextColumns = options.columns
            ? new Map(current.columns).set(taskId, options.columns)
            : current.columns;

          return { tasks: nextTasks, renderOrder: nextRenderOrder, columns: nextColumns };
        }, now);

        return taskId;
      }),
    updateTask: (taskId, options) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;

        yield* updateState((current) => {
          const currentTask = current.tasks.get(taskId);
          if (!currentTask) {
            return current;
          }

          const nextTask = updatedSnapshot(currentTask, options, now);
          const nextTasks = new Map(current.tasks);
          nextTasks.set(taskId, nextTask);

          return { tasks: nextTasks, renderOrder: current.renderOrder, columns: current.columns };
        }, now);
      }),
    incrementSucceeded: (taskId, amount = 1) => incrementCounter(taskId, "succeeded", amount),
    incrementFailed: (taskId, amount = 1) => incrementCounter(taskId, "failed", amount),
    completeTask: (taskId) => finalizeTask(taskId, "done"),
    failTask: (taskId) => finalizeTask(taskId, "failed"),
    getTask: (taskId) => Effect.sync(() => Option.fromNullishOr(state.tasks.get(taskId))),
    listTasks: Effect.sync(() => Array.from(state.tasks.values())),
    setMetadata: (taskId, metadata) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;

        yield* updateState((current) => {
          const currentTask = current.tasks.get(taskId);
          if (!currentTask) {
            return current;
          }

          const nextTasks = new Map(current.tasks);
          nextTasks.set(taskId, { ...currentTask, metadata } satisfies TaskSnapshot);

          return { tasks: nextTasks, renderOrder: current.renderOrder, columns: current.columns };
        }, now);
      }),
    getMetadata: (taskId) =>
      Effect.sync(() => {
        const task = state.tasks.get(taskId);
        return task?.metadata;
      }),
  };

  return { store, publisherLoop };
};

export const makeProgressStore = Effect.gen(function* () {
  const publishQueue = yield* Queue.sliding<void>(1);
  const runtime = makeProgressStoreRuntime(publishQueue);
  yield* Effect.forkScoped(runtime.publisherLoop);
  return runtime.store;
});

export class ProgressStore extends Context.Service<ProgressStore, ProgressStoreService>()(
  "stromseng.dev/effective-progress/ProgressStore",
) {
  static readonly layer = Layer.effect(ProgressStore, makeProgressStore);
}
