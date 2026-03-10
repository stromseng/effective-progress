import { Clock, Effect, Option } from "effect";
import type { AddTaskOptions, TaskId, TaskStore, UpdateTaskOptions } from "../types";
import { TaskId as makeTaskId, TaskSnapshot } from "../types";
import { toRenderSnapshot, type RenderSnapshot } from "./store/render-snapshot";

interface TaskCounts {
  readonly succeeded: number;
  readonly failed: number;
  readonly total?: number;
}

export interface ProgressRenderStore {
  readonly getSnapshot: () => RenderSnapshot;
  readonly subscribe: (listener: () => void) => () => void;
  readonly flush: () => void;
  readonly addTask: (options: AddTaskOptions) => Effect.Effect<TaskId>;
  readonly updateTask: (taskId: TaskId, options: UpdateTaskOptions) => Effect.Effect<void>;
  readonly incrementSucceeded: (taskId: TaskId, amount?: number) => Effect.Effect<void>;
  readonly incrementFailed: (taskId: TaskId, amount?: number) => Effect.Effect<void>;
  readonly completeTask: (taskId: TaskId) => Effect.Effect<void>;
  readonly failTask: (taskId: TaskId) => Effect.Effect<void>;
  readonly getTask: (taskId: TaskId) => Effect.Effect<Option.Option<TaskSnapshot>>;
  readonly listTasks: Effect.Effect<ReadonlyArray<TaskSnapshot>>;
}

const hasExplicitTotal = (options: Pick<AddTaskOptions | UpdateTaskOptions, "total">) =>
  Object.prototype.hasOwnProperty.call(options, "total");

const sanitizeTotalOnAdd = (total: number | undefined) => {
  if (total === undefined) {
    return undefined;
  }

  // Negative totals are treated as "unknown total" from the start.
  return total < 0 ? undefined : total;
};

const sanitizeTotalOnUpdate = (nextTotal: number | undefined) => {
  if (nextTotal === undefined) {
    return undefined;
  }

  // A negative update also clears the total back to indeterminate.
  return nextTotal < 0 ? undefined : nextTotal;
};

const normalizeUnits = (counts: TaskCounts) => {
  const succeeded = Math.max(0, counts.succeeded);
  const failed = Math.max(0, counts.failed);

  // Keep raw overflow counts in state; the bar clamps only at render time.
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

const updatedSnapshot = (snapshot: TaskSnapshot, options: UpdateTaskOptions) => {
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
    id: snapshot.id,
    parentId: snapshot.parentId,
    description: options.description ?? snapshot.description,
    status: snapshot.status,
    countDisplay: options.countDisplay ?? snapshot.countDisplay,
    transient: options.transient ?? snapshot.transient,
    units,
    startedAt: snapshot.startedAt,
    completedAt: snapshot.completedAt,
  });
};

const withTransient = (snapshot: TaskSnapshot, transient: boolean) =>
  TaskSnapshot({
    id: snapshot.id,
    parentId: snapshot.parentId,
    description: snapshot.description,
    status: snapshot.status,
    countDisplay: snapshot.countDisplay,
    transient,
    units: snapshot.units,
    startedAt: snapshot.startedAt,
    completedAt: snapshot.completedAt,
  });

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

const SNAPSHOT_PUBLISH_INTERVAL_MILLIS = 100;

export const makeProgressRenderStore = () => {
  let nextTaskId = 0;
  let state: TaskStore = {
    tasks: new Map<TaskId, TaskSnapshot>(),
    renderOrder: [],
  };
  let publishedSnapshot = toRenderSnapshot(state);
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
    hasPendingPublish = false;
    lastPublishAt = Date.now();
    publishedSnapshot = toRenderSnapshot(state);
    notifyListeners();
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

  const publish = (nextState: TaskStore): void => {
    if (nextState === state) {
      return;
    }

    state = nextState;
    hasPendingPublish = true;
    schedulePublish();
  };

  const updateState = (transform: (current: TaskStore) => TaskStore): void => {
    publish(transform(state));
  };

  const store = {
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
        });

        updateState((current) => {
          const nextTasks = new Map(current.tasks);
          nextTasks.set(taskId, task);
          const { index, depth } = findInsertionIndex(current.renderOrder, parentId);
          const nextRenderOrder = [...current.renderOrder];
          nextRenderOrder.splice(index, 0, { id: taskId, depth });
          return { tasks: nextTasks, renderOrder: nextRenderOrder };
        });

        return taskId;
      }),
    updateTask: (taskId, options) =>
      Effect.gen(function* () {
        const currentTask = state.tasks.get(taskId);
        if (!currentTask) {
          return;
        }

        const nextTask = updatedSnapshot(currentTask, options);

        updateState((current) => {
          const liveTask = current.tasks.get(taskId);
          if (!liveTask) {
            return current;
          }

          const nextTasks = new Map(current.tasks);
          nextTasks.set(taskId, nextTask);

          if (options.transient !== undefined) {
            for (const [candidateId, candidate] of current.tasks.entries()) {
              if (candidateId === taskId) {
                continue;
              }

              let parentId = candidate.parentId;
              let isDescendant = false;
              while (parentId !== null) {
                if (parentId === taskId) {
                  isDescendant = true;
                  break;
                }

                parentId = current.tasks.get(parentId)?.parentId ?? null;
              }

              if (isDescendant) {
                nextTasks.set(candidateId, withTransient(candidate, nextTask.transient));
              }
            }
          }

          return { tasks: nextTasks, renderOrder: current.renderOrder };
        });
      }),
    incrementSucceeded: (taskId, amount = 1) =>
      Effect.sync(() => {
        updateState((current) => {
          const currentTask = current.tasks.get(taskId);
          if (!currentTask) {
            return current;
          }

          const nextTasks = new Map(current.tasks);
          nextTasks.set(
            taskId,
            TaskSnapshot({
              id: currentTask.id,
              parentId: currentTask.parentId,
              description: currentTask.description,
              status: currentTask.status,
              countDisplay: currentTask.countDisplay,
              transient: currentTask.transient,
              units: normalizeUnits({
                succeeded: currentTask.units.succeeded + amount,
                failed: currentTask.units.failed,
                total: currentTask.units.total,
              }),
              startedAt: currentTask.startedAt,
              completedAt: currentTask.completedAt,
            }),
          );

          return { tasks: nextTasks, renderOrder: current.renderOrder };
        });
      }),
    incrementFailed: (taskId, amount = 1) =>
      Effect.sync(() => {
        updateState((current) => {
          const currentTask = current.tasks.get(taskId);
          if (!currentTask) {
            return current;
          }

          const nextTasks = new Map(current.tasks);
          nextTasks.set(
            taskId,
            TaskSnapshot({
              id: currentTask.id,
              parentId: currentTask.parentId,
              description: currentTask.description,
              status: currentTask.status,
              countDisplay: currentTask.countDisplay,
              transient: currentTask.transient,
              units: normalizeUnits({
                succeeded: currentTask.units.succeeded,
                failed: currentTask.units.failed + amount,
                total: currentTask.units.total,
              }),
              startedAt: currentTask.startedAt,
              completedAt: currentTask.completedAt,
            }),
          );

          return { tasks: nextTasks, renderOrder: current.renderOrder };
        });
      }),
    completeTask: (taskId) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;

        updateState((current) => {
          const currentTask = current.tasks.get(taskId);
          if (!currentTask) {
            return current;
          }

          const nextTasks = new Map(current.tasks);
          if (currentTask.transient) {
            nextTasks.delete(taskId);
            return {
              tasks: nextTasks,
              renderOrder: removeFromRenderOrder(current.renderOrder, taskId),
            };
          }

          nextTasks.set(
            taskId,
            TaskSnapshot({
              id: currentTask.id,
              parentId: currentTask.parentId,
              description: currentTask.description,
              status: "done",
              countDisplay: currentTask.countDisplay,
              transient: currentTask.transient,
              units:
                currentTask.units.total !== undefined
                  ? currentTask.units.processed < currentTask.units.total
                    ? normalizeUnits({
                        succeeded:
                          currentTask.units.succeeded +
                          (currentTask.units.total - currentTask.units.processed),
                        failed: currentTask.units.failed,
                        total: currentTask.units.total,
                      })
                    : // Preserve overflowed raw counts once the task has already reached/passed total.
                      currentTask.units
                  : currentTask.units.processed > 0
                    ? normalizeUnits({
                        succeeded: currentTask.units.succeeded,
                        failed: currentTask.units.failed,
                        total: currentTask.units.processed,
                      })
                    : currentTask.units,
              startedAt: currentTask.startedAt,
              completedAt: now,
            }),
          );

          return { tasks: nextTasks, renderOrder: current.renderOrder };
        });
      }),
    failTask: (taskId) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;

        updateState((current) => {
          const currentTask = current.tasks.get(taskId);
          if (!currentTask) {
            return current;
          }

          const nextTasks = new Map(current.tasks);
          if (currentTask.transient) {
            nextTasks.delete(taskId);
            return {
              tasks: nextTasks,
              renderOrder: removeFromRenderOrder(current.renderOrder, taskId),
            };
          }

          nextTasks.set(
            taskId,
            TaskSnapshot({
              id: currentTask.id,
              parentId: currentTask.parentId,
              description: currentTask.description,
              status: "failed",
              countDisplay: currentTask.countDisplay,
              transient: currentTask.transient,
              units: currentTask.units,
              startedAt: currentTask.startedAt,
              completedAt: now,
            }),
          );

          return { tasks: nextTasks, renderOrder: current.renderOrder };
        });
      }),
    getTask: (taskId) => Effect.sync(() => Option.fromNullable(state.tasks.get(taskId))),
    listTasks: Effect.sync(() => Array.from(state.tasks.values())),
  } satisfies ProgressRenderStore;

  return store;
};
