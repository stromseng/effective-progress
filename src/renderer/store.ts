import { Clock, Context, Effect, Layer, Option } from "effect";
import type {
  AddTaskOptions,
  ColumnDef,
  ProgressTaskEvent,
  TaskProgressSample,
  TaskId,
  TaskStore,
  UpdateTaskOptions,
} from "../types";
import { TaskId as makeTaskId, TaskSnapshot } from "../types";
import {
  TaskAddedEvent,
  TaskAdvancedEvent,
  TaskCompletedEvent,
  TaskFailedEvent,
  TaskRemovedEvent,
  TaskUpdatedEvent,
} from "../types";

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

export interface ProgressStore {
  readonly getSnapshot: () => RenderPublication;
  readonly subscribe: (listener: () => void) => () => void;
  readonly flush: () => void;
  // biome-ignore lint: any is needed here — the store is heterogeneous
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

export const ProgressStore = Context.GenericTag<ProgressStore>(
  "stromseng.dev/effective-progress/ProgressStore",
);

const hasExplicitTotal = (options: Pick<AddTaskOptions | UpdateTaskOptions, "total">) =>
  Object.prototype.hasOwnProperty.call(options, "total");

const sanitizeTotalOnAdd = (total: number | undefined) => {
  if (total === undefined) {
    return undefined;
  }

  return total < 0 ? undefined : total;
};

const sanitizeTotalOnUpdate = (nextTotal: number | undefined) => {
  if (nextTotal === undefined) {
    return undefined;
  }

  return nextTotal < 0 ? undefined : nextTotal;
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
  const nextSamples = [...previousSamples, { timestamp: now, processed }];
  while (
    nextSamples.length > 2 &&
    (nextSamples.length > ETA_SAMPLE_MAX_LENGTH || nextSamples[1]!.timestamp < windowStart)
  ) {
    nextSamples.shift();
  }

  return nextSamples;
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
          total: hasExplicitTotal(options)
            ? sanitizeTotalOnUpdate(options.total)
            : currentUnits.total,
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

const SNAPSHOT_PUBLISH_INTERVAL_MILLIS = 100;

export const makeProgressRenderStore = () => {
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
  let lastPublishAt = 0;
  let publishTimeout: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();

  const notifyListeners = (): void => {
    for (const listener of listeners) {
      listener();
    }
  };

  const publishNow = (): void => {
    const nextPublication: RenderPublication = {
      snapshot: state,
      events: [...pendingEvents],
    };

    hasPendingPublish = false;
    publishedPublication = nextPublication;
    notifyListeners();
    pendingEvents = [];
    lastPublishAt = Date.now();
  };

  const clearScheduledPublish = (): void => {
    if (publishTimeout === undefined) {
      return;
    }

    clearTimeout(publishTimeout);
    publishTimeout = undefined;
  };

  const schedulePublish = (): void => {
    if (!hasPendingPublish) {
      return;
    }

    const now = Date.now();
    const waitMillis = Math.max(0, SNAPSHOT_PUBLISH_INTERVAL_MILLIS - (now - lastPublishAt));
    if (waitMillis === 0) {
      clearScheduledPublish();
      publishNow();
      return;
    }

    if (publishTimeout !== undefined) {
      return;
    }

    publishTimeout = setTimeout(() => {
      publishTimeout = undefined;
      if (!hasPendingPublish) {
        return;
      }
      publishNow();
    }, waitMillis);
  };

  const publish = (update: StateUpdate): void => {
    if (update.state === state) {
      return;
    }

    state = update.state;
    if (update.events.length > 0) {
      pendingEvents.push(...update.events);
    }
    hasPendingPublish = true;
    schedulePublish();
  };

  const updateState = (transform: (current: TaskStore) => StateUpdate): void => {
    publish(transform(state));
  };

  const store = {
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
      clearScheduledPublish();
      publishNow();
    },
    addTask: (options) =>
      Effect.gen(function* () {
        const taskId = makeTaskId(++nextTaskId);
        const units = normalizeUnits({
          succeeded: 0,
          failed: 0,
          total: sanitizeTotalOnAdd(options.total),
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

        updateState((current) => {
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
        });

        return taskId;
      }),
    updateTask: (taskId, options) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;

        updateState((current) => {
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
        });
      }),
    incrementSucceeded: (taskId, amount = 1) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;

        updateState((current) => {
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
        });
      }),
    incrementFailed: (taskId, amount = 1) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;

        updateState((current) => {
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
        });
      }),
    completeTask: (taskId) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;

        updateState((current) => {
          const currentTask = current.tasks.get(taskId);
          if (!currentTask) {
            return { state: current, events: [] };
          }
          if (currentTask.status !== "running") {
            return { state: current, events: [] };
          }

          const nextTasks = new Map(current.tasks);
          if (currentTask.transient) {
            const removedTaskIds = subtreeTaskIds(current.renderOrder, taskId);
            for (const removedTaskId of removedTaskIds) {
              nextTasks.delete(removedTaskId);
            }

            const nextColumns = new Map(current.columns);
            for (const removedTaskId of removedTaskIds) {
              nextColumns.delete(removedTaskId);
            }

            return {
              state: {
                tasks: nextTasks,
                renderOrder: removeFromRenderOrder(current.renderOrder, taskId),
                columns: nextColumns,
              },
              events: [
                new TaskCompletedEvent({ taskId }),
                ...removedTaskIds.map(
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
        });
      }),
    failTask: (taskId) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;

        updateState((current) => {
          const currentTask = current.tasks.get(taskId);
          if (!currentTask) {
            return { state: current, events: [] };
          }
          if (currentTask.status !== "running") {
            return { state: current, events: [] };
          }

          const nextTasks = new Map(current.tasks);
          if (currentTask.transient) {
            const removedTaskIds = subtreeTaskIds(current.renderOrder, taskId);
            for (const removedTaskId of removedTaskIds) {
              nextTasks.delete(removedTaskId);
            }

            const nextColumns = new Map(current.columns);
            for (const removedTaskId of removedTaskIds) {
              nextColumns.delete(removedTaskId);
            }

            return {
              state: {
                tasks: nextTasks,
                renderOrder: removeFromRenderOrder(current.renderOrder, taskId),
                columns: nextColumns,
              },
              events: [
                new TaskFailedEvent({ taskId }),
                ...removedTaskIds.map(
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
        });
      }),
    getTask: (taskId) => Effect.sync(() => Option.fromNullable(state.tasks.get(taskId))),
    listTasks: Effect.sync(() => Array.from(state.tasks.values())),
    setMetadata: (taskId, metadata) =>
      Effect.sync(() => {
        updateState((current) => {
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
        });
      }),
    getMetadata: (taskId) =>
      Effect.sync(() => {
        const task = state.tasks.get(taskId);
        return task?.metadata;
      }),
  } satisfies ProgressStore;

  return store;
};

export const LayerProgressStoreDefault = Layer.effect(
  ProgressStore,
  Effect.sync(() => makeProgressRenderStore()),
);
