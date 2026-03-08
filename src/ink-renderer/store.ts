import { Clock, Effect, Option } from "effect";
import type { AddTaskOptions, TaskId, TaskStore, UpdateTaskOptions } from "../types";
import {
  DeterminateTaskUnits,
  IndeterminateTaskUnits,
  TaskId as makeTaskId,
  TaskSnapshot,
} from "../types";
import { toRenderSnapshot, type RenderSnapshot } from "./snapshot/render-snapshot";

interface DeterminateCounts {
  readonly succeeded: number;
  readonly failed: number;
  readonly total: number;
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

const normalizeDeterminateCounts = (counts: DeterminateCounts): DeterminateTaskUnits => {
  const total = Math.max(0, counts.total);
  const failed = Math.min(total, Math.max(0, counts.failed));
  const succeeded = Math.min(total - failed, Math.max(0, counts.succeeded));
  const processed = succeeded + failed;

  return new DeterminateTaskUnits({
    succeeded,
    failed,
    processed,
    total,
  });
};

const updateDeterminateCounts = (
  units: DeterminateTaskUnits,
  options: Pick<UpdateTaskOptions, "succeeded" | "failed" | "total">,
): DeterminateTaskUnits =>
  normalizeDeterminateCounts({
    succeeded: options.succeeded ?? units.succeeded,
    failed: options.failed ?? units.failed,
    total: options.total ?? units.total,
  });

const updatedSnapshot = (snapshot: TaskSnapshot, options: UpdateTaskOptions): TaskSnapshot => {
  const currentUnits = snapshot.units;
  const units = (() => {
    if (options.total !== undefined) {
      if (options.total <= 0) {
        return new IndeterminateTaskUnits({});
      }

      if (currentUnits._tag === "DeterminateTaskUnits") {
        return updateDeterminateCounts(currentUnits, options);
      }

      return normalizeDeterminateCounts({
        succeeded: options.succeeded ?? 0,
        failed: options.failed ?? 0,
        total: options.total,
      });
    }

    if (currentUnits._tag === "DeterminateTaskUnits") {
      if (options.succeeded === undefined && options.failed === undefined) {
        return currentUnits;
      }

      return updateDeterminateCounts(currentUnits, options);
    }

    return currentUnits;
  })();

  return new TaskSnapshot({
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

const withTransient = (snapshot: TaskSnapshot, transient: boolean): TaskSnapshot =>
  new TaskSnapshot({
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
): { index: number; depth: number } => {
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
): ReadonlyArray<TaskStore["renderOrder"][number]> => {
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

const SNAPSHOT_PUBLISH_INTERVAL_MILLIS = 50;

export const makeProgressRenderStore = (): ProgressRenderStore => {
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

  return {
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
        const units =
          options.total === undefined || options.total <= 0
            ? new IndeterminateTaskUnits({})
            : normalizeDeterminateCounts({
                succeeded: 0,
                failed: 0,
                total: options.total,
              });
        const parentSnapshot =
          options.parentId === undefined ? undefined : state.tasks.get(options.parentId);
        const now = yield* Clock.currentTimeMillis;
        const parentId = options.parentId ?? null;
        const countDisplay = options.countDisplay ?? parentSnapshot?.countDisplay ?? "detailed";
        const task = new TaskSnapshot({
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
      Effect.sync(() => {
        updateState((current) => {
          const currentTask = current.tasks.get(taskId);
          if (!currentTask) {
            return current;
          }

          const nextTasks = new Map(current.tasks);
          const nextTask = updatedSnapshot(currentTask, options);
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
          if (!currentTask || currentTask.units._tag !== "DeterminateTaskUnits") {
            return current;
          }

          const nextTasks = new Map(current.tasks);
          nextTasks.set(
            taskId,
            new TaskSnapshot({
              id: currentTask.id,
              parentId: currentTask.parentId,
              description: currentTask.description,
              status: currentTask.status,
              countDisplay: currentTask.countDisplay,
              transient: currentTask.transient,
              units: normalizeDeterminateCounts({
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
          if (!currentTask || currentTask.units._tag !== "DeterminateTaskUnits") {
            return current;
          }

          const nextTasks = new Map(current.tasks);
          nextTasks.set(
            taskId,
            new TaskSnapshot({
              id: currentTask.id,
              parentId: currentTask.parentId,
              description: currentTask.description,
              status: currentTask.status,
              countDisplay: currentTask.countDisplay,
              transient: currentTask.transient,
              units: normalizeDeterminateCounts({
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
            new TaskSnapshot({
              id: currentTask.id,
              parentId: currentTask.parentId,
              description: currentTask.description,
              status: "done",
              countDisplay: currentTask.countDisplay,
              transient: currentTask.transient,
              units:
                currentTask.units._tag === "DeterminateTaskUnits"
                  ? normalizeDeterminateCounts({
                      succeeded: currentTask.units.total - currentTask.units.failed,
                      failed: currentTask.units.failed,
                      total: currentTask.units.total,
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
            new TaskSnapshot({
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
  };
};
