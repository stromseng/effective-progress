import { Clock, Context, Effect, Layer, Option, Queue } from "effect";
import type {
  AddTaskOptions,
  ColumnDef,
  ProgressTaskEvent,
  TaskProgressSample,
  TaskId,
  TaskStore,
  UpdateTaskOptions,
} from "../../types";
import { TaskId as makeTaskId, TaskSnapshot } from "../../types";
import {
  TaskAddedEvent,
  TaskAdvancedEvent,
  TaskCompletedEvent,
  TaskFailedEvent,
  TaskRemovedEvent,
  TaskUpdatedEvent,
} from "../../types";

interface TaskCounts {
  readonly succeeded: number;
  readonly failed: number;
  readonly total?: number;
}

const ETA_SAMPLE_WINDOW_MILLIS = 30_000;
const ETA_SAMPLE_MAX_LENGTH = 1_000;

export interface RenderPublication {
  readonly snapshot: TaskStore;
  readonly events: ReadonlyArray<ProgressTaskEvent>;
}

export interface ProgressStoreShape {
  readonly getSnapshot: () => RenderPublication;
  readonly subscribe: (listener: () => void) => () => void;
  readonly flush: () => void;
  readonly addTask: (options: AddTaskOptions<any>) => Effect.Effect<TaskId>;
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

const hasExplicitTotal = (options: Pick<AddTaskOptions | UpdateTaskOptions, "total">) =>
  Object.prototype.hasOwnProperty.call(options, "total");

const sanitizeTotal = (total: number | undefined) => {
  if (total === undefined) {
    return undefined;
  }

  return total < 0 ? undefined : total;
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

  return TaskSnapshot({
    ...snapshot,
    description: options.description ?? snapshot.description,
    countDisplay: options.countDisplay ?? snapshot.countDisplay,
    transient: options.transient ?? snapshot.transient,
    units,
    progressSamples: appendProgressSample(snapshot.progressSamples, now, units.processed),
  });
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

const removeFromRenderOrder = (
  renderOrder: ReadonlyArray<TaskStore["renderOrder"][number]>,
  taskId: TaskId,
) => {
  const idx = renderOrder.findIndex((row) => row.id === taskId);
  if (idx === -1) {
    return renderOrder;
  }

  const taskDepth = renderOrder[idx]!.depth;
  let end = idx + 1;
  while (end < renderOrder.length && renderOrder[end]!.depth > taskDepth) {
    end++;
  }

  const next = [...renderOrder];
  next.splice(idx, end - idx);
  return next;
};

const subtreeTaskIds = (
  renderOrder: ReadonlyArray<TaskStore["renderOrder"][number]>,
  taskId: TaskId,
): ReadonlyArray<TaskId> => {
  const idx = renderOrder.findIndex((row) => row.id === taskId);
  if (idx === -1) {
    return [];
  }

  const taskDepth = renderOrder[idx]!.depth;
  let end = idx + 1;
  while (end < renderOrder.length && renderOrder[end]!.depth > taskDepth) {
    end++;
  }

  return renderOrder.slice(idx, end).map((row) => row.id);
};

interface StateUpdate {
  readonly state: TaskStore;
  readonly events: ReadonlyArray<ProgressTaskEvent>;
}

const removeTransientSubtree = (
  current: TaskStore,
  nextTasks: Map<TaskId, TaskSnapshot>,
  taskId: TaskId,
) => {
  const removedTaskIds = subtreeTaskIds(current.renderOrder, taskId);
  for (const removedTaskId of removedTaskIds) {
    nextTasks.delete(removedTaskId);
  }

  const nextColumns = new Map(current.columns);
  for (const removedTaskId of removedTaskIds) {
    nextColumns.delete(removedTaskId);
  }

  return {
    removedTaskIds,
    renderOrder: removeFromRenderOrder(current.renderOrder, taskId),
    columns: nextColumns,
  };
};

const SNAPSHOT_PUBLISH_INTERVAL_MILLIS = 100;

interface ProgressStoreRuntime {
  readonly store: ProgressStoreShape;
  readonly publisherLoop: Effect.Effect<never>;
}

const makeProgressStoreRuntime = (publishQueue: Queue.Queue<void>): ProgressStoreRuntime => {
  let nextTaskId = 0;
  let state: TaskStore = {
    tasks: new Map<TaskId, TaskSnapshot>(),
    renderOrder: [],
    columns: new Map<TaskId, ReadonlyArray<ColumnDef<any, any>>>(),
  };
  let pendingEvents: Array<ProgressTaskEvent> = [];
  let publishedPublication: RenderPublication = {
    snapshot: state,
    events: [],
  };
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
    const nextPublication: RenderPublication = {
      snapshot: state,
      events: [...pendingEvents],
    };

    hasPendingPublish = false;
    publishedPublication = nextPublication;
    notifyListeners();
    pendingEvents = [];
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

  const publish = (update: StateUpdate, now: number): Effect.Effect<void> => {
    if (update.state === state) {
      return Effect.void;
    }

    latestObservedAt = now;
    state = update.state;
    if (update.events.length > 0) {
      pendingEvents.push(...update.events);
    }
    hasPendingPublish = true;
    return schedulePublish;
  };

  const updateState = (
    transform: (current: TaskStore) => StateUpdate,
    now: number,
  ): Effect.Effect<void> => {
    return publish(transform(state), now);
  };

  const store: ProgressStoreShape = {
    getSnapshot: () => publishedPublication,
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
        const task = TaskSnapshot({
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
        });

        yield* updateState((current) => {
          const nextTasks = new Map(current.tasks);
          nextTasks.set(taskId, task);
          const { index, depth } = findInsertionIndex(current.renderOrder, parentId);
          const nextRenderOrder = [...current.renderOrder];
          nextRenderOrder.splice(index, 0, { id: taskId, depth });

          const nextColumns = options.columns
            ? new Map(current.columns).set(
                taskId,
                options.columns as ReadonlyArray<ColumnDef<any, any>>,
              )
            : current.columns;

          return {
            state: { tasks: nextTasks, renderOrder: nextRenderOrder, columns: nextColumns },
            events: [
              new TaskAddedEvent({
                taskId,
                parentId,
                description: task.description,
                total: task.units.total,
                transient: task.transient,
                countDisplay: task.countDisplay,
              }),
            ],
          };
        }, now);

        return taskId;
      }),
    updateTask: (taskId, options) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;

        yield* updateState((current) => {
          const currentTask = current.tasks.get(taskId);
          if (!currentTask) {
            return { state: current, events: [] };
          }

          const nextTask = updatedSnapshot(currentTask, options, now);
          const nextTasks = new Map(current.tasks);
          nextTasks.set(taskId, nextTask);

          const events: Array<ProgressTaskEvent> = [
            new TaskUpdatedEvent({
              taskId,
              description: options.description ?? undefined,
              succeeded: options.succeeded ?? undefined,
              failed: options.failed ?? undefined,
              processed:
                options.succeeded !== undefined || options.failed !== undefined
                  ? nextTask.units.processed
                  : undefined,
              total: hasExplicitTotal(options) ? nextTask.units.total : undefined,
              transient: options.transient ?? undefined,
              countDisplay: options.countDisplay ?? undefined,
            }),
          ];

          if (options.transient !== undefined) {
            for (const candidateId of subtreeTaskIds(current.renderOrder, taskId).slice(1)) {
              const candidate = current.tasks.get(candidateId);
              if (!candidate) {
                continue;
              }

              const nextCandidate = TaskSnapshot({ ...candidate, transient: nextTask.transient });
              nextTasks.set(candidateId, nextCandidate);
              events.push(
                new TaskUpdatedEvent({
                  taskId: candidateId,
                  transient: nextCandidate.transient,
                }),
              );
            }
          }

          return {
            state: { tasks: nextTasks, renderOrder: current.renderOrder, columns: current.columns },
            events,
          };
        }, now);
      }),
    incrementSucceeded: (taskId, amount = 1) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;

        yield* updateState((current) => {
          const currentTask = current.tasks.get(taskId);
          if (!currentTask) {
            return { state: current, events: [] };
          }

          const units = normalizeUnits({
            succeeded: currentTask.units.succeeded + amount,
            failed: currentTask.units.failed,
            total: currentTask.units.total,
          });
          const nextTasks = new Map(current.tasks);
          nextTasks.set(
            taskId,
            TaskSnapshot({
              ...currentTask,
              units,
              progressSamples: appendProgressSample(
                currentTask.progressSamples,
                now,
                units.processed,
              ),
            }),
          );

          return {
            state: { tasks: nextTasks, renderOrder: current.renderOrder, columns: current.columns },
            events: [new TaskAdvancedEvent({ taskId, amount, kind: "succeeded" })],
          };
        }, now);
      }),
    incrementFailed: (taskId, amount = 1) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;

        yield* updateState((current) => {
          const currentTask = current.tasks.get(taskId);
          if (!currentTask) {
            return { state: current, events: [] };
          }

          const units = normalizeUnits({
            succeeded: currentTask.units.succeeded,
            failed: currentTask.units.failed + amount,
            total: currentTask.units.total,
          });
          const nextTasks = new Map(current.tasks);
          nextTasks.set(
            taskId,
            TaskSnapshot({
              ...currentTask,
              units,
              progressSamples: appendProgressSample(
                currentTask.progressSamples,
                now,
                units.processed,
              ),
            }),
          );

          return {
            state: { tasks: nextTasks, renderOrder: current.renderOrder, columns: current.columns },
            events: [new TaskAdvancedEvent({ taskId, amount, kind: "failed" })],
          };
        }, now);
      }),
    completeTask: (taskId) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;

        yield* updateState((current) => {
          const currentTask = current.tasks.get(taskId);
          if (!currentTask) {
            return { state: current, events: [] };
          }
          if (currentTask.status !== "running") {
            return { state: current, events: [] };
          }

          const nextTasks = new Map(current.tasks);
          if (currentTask.transient) {
            const removedSubtree = removeTransientSubtree(current, nextTasks, taskId);

            return {
              state: {
                tasks: nextTasks,
                renderOrder: removedSubtree.renderOrder,
                columns: removedSubtree.columns,
              },
              events: [
                new TaskCompletedEvent({ taskId }),
                ...removedSubtree.removedTaskIds.map(
                  (removedTaskId) => new TaskRemovedEvent({ taskId: removedTaskId }),
                ),
              ],
            };
          }

          const units =
            currentTask.units.total !== undefined
              ? currentTask.units.processed < currentTask.units.total
                ? normalizeUnits({
                    succeeded:
                      currentTask.units.succeeded +
                      (currentTask.units.total - currentTask.units.processed),
                    failed: currentTask.units.failed,
                    total: currentTask.units.total,
                  })
                : currentTask.units
              : currentTask.units.processed > 0
                ? normalizeUnits({
                    succeeded: currentTask.units.succeeded,
                    failed: currentTask.units.failed,
                    total: currentTask.units.processed,
                  })
                : currentTask.units;

          nextTasks.set(
            taskId,
            TaskSnapshot({
              ...currentTask,
              status: "done",
              units,
              completedAt: now,
              progressSamples: appendProgressSample(
                currentTask.progressSamples,
                now,
                units.processed,
              ),
            }),
          );

          return {
            state: { tasks: nextTasks, renderOrder: current.renderOrder, columns: current.columns },
            events: [new TaskCompletedEvent({ taskId })],
          };
        }, now);
      }),
    failTask: (taskId) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;

        yield* updateState((current) => {
          const currentTask = current.tasks.get(taskId);
          if (!currentTask) {
            return { state: current, events: [] };
          }
          if (currentTask.status !== "running") {
            return { state: current, events: [] };
          }

          const nextTasks = new Map(current.tasks);
          if (currentTask.transient) {
            const removedSubtree = removeTransientSubtree(current, nextTasks, taskId);

            return {
              state: {
                tasks: nextTasks,
                renderOrder: removedSubtree.renderOrder,
                columns: removedSubtree.columns,
              },
              events: [
                new TaskFailedEvent({ taskId }),
                ...removedSubtree.removedTaskIds.map(
                  (removedTaskId) => new TaskRemovedEvent({ taskId: removedTaskId }),
                ),
              ],
            };
          }

          nextTasks.set(
            taskId,
            TaskSnapshot({ ...currentTask, status: "failed", completedAt: now }),
          );

          return {
            state: { tasks: nextTasks, renderOrder: current.renderOrder, columns: current.columns },
            events: [new TaskFailedEvent({ taskId })],
          };
        }, now);
      }),
    getTask: (taskId) => Effect.sync(() => Option.fromNullishOr(state.tasks.get(taskId))),
    listTasks: Effect.sync(() => Array.from(state.tasks.values())),
    setMetadata: (taskId, metadata) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;

        yield* updateState((current) => {
          const currentTask = current.tasks.get(taskId);
          if (!currentTask) {
            return { state: current, events: [] };
          }

          const nextTasks = new Map(current.tasks);
          nextTasks.set(taskId, TaskSnapshot({ ...currentTask, metadata }));

          return {
            state: { tasks: nextTasks, renderOrder: current.renderOrder, columns: current.columns },
            events: [],
          };
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

export const makeProgressStore: Effect.Effect<ProgressStoreShape> = Effect.gen(function* () {
  const publishQueue = yield* Queue.sliding<void>(1);
  const runtime = makeProgressStoreRuntime(publishQueue);
  yield* Effect.forkDetach(runtime.publisherLoop);
  return runtime.store;
});

export class ProgressStore extends Context.Service<ProgressStore, ProgressStoreShape>()(
  "stromseng.dev/effective-progress/ProgressStore",
) {
  static readonly layer = Layer.effect(ProgressStore, makeProgressStore);
}
