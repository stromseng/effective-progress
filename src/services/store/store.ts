import { appendProgressSample } from "../../progress-estimation";
import { Clock, Context, Effect, Layer, Option, Queue } from "effect";
import type { Column } from "../../columns/types";
import type { TaskId } from "../../task-model";
import type { TaskStore } from "./types";
import type { TaskOperations } from "../task-operations";
import { TaskId as makeTaskId, type TaskSnapshot } from "../../task-model";
import {
  createTaskSnapshot,
  finalizeTaskSnapshot,
  normalizeUnits,
  updatedSnapshot,
} from "./task-state";
import { findInsertionIndex, removeTransientSubtree } from "./task-tree";
import { createSnapshotPublisher } from "./snapshot-publisher";

export interface ProgressStoreService extends TaskOperations {
  /** The renderer reads throttled snapshots; task operations read current state. */
  readonly getPublishedSnapshot: () => TaskStore;
  readonly subscribe: (listener: () => void) => () => void;
  readonly flush: () => void;
  readonly updateMetadata: (
    taskId: TaskId,
    f: (metadata: TaskSnapshot["metadata"]) => TaskSnapshot["metadata"],
  ) => Effect.Effect<void>;
}

interface ProgressStoreRuntime {
  readonly store: ProgressStoreService;
  readonly publisherLoop: Effect.Effect<never>;
}

const makeProgressStoreRuntime = (publishQueue: Queue.Queue<void>): ProgressStoreRuntime => {
  let nextTaskId = 0;
  let state: TaskStore = {
    tasks: new Map<TaskId, TaskSnapshot>(),
    renderOrder: [],
    columns: new Map<TaskId, ReadonlyArray<Column>>(),
  };
  const publisher = createSnapshotPublisher(state, publishQueue);

  const updateState = (
    transform: (current: TaskStore) => TaskStore,
    now: number,
  ): Effect.Effect<void> => {
    const nextState = transform(state);
    if (nextState === state) {
      return Effect.void;
    }

    state = nextState;
    return publisher.publish(state, now);
  };

  /** Replaces a task and records progress in one synchronous state transition. Undefined removes its subtree. */
  const modifyTask = (
    taskId: TaskId,
    transform: (task: TaskSnapshot, now: number) => TaskSnapshot | undefined,
  ) =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      yield* updateState((current) => {
        const task = current.tasks.get(taskId);
        if (!task) {
          return current;
        }
        const nextTask = transform(task, now);
        if (nextTask === task) {
          return current;
        }
        const tasks = new Map(current.tasks);
        if (nextTask === undefined) {
          return { tasks, ...removeTransientSubtree(current, tasks, taskId) };
        }
        tasks.set(taskId, {
          ...nextTask,
          progressSamples: appendProgressSample(
            task.progressSamples,
            now,
            nextTask.units.processed,
          ),
        });
        return { ...current, tasks };
      }, now);
    });

  const incrementCounter = (taskId: TaskId, kind: "succeeded" | "failed", amount: number) =>
    modifyTask(taskId, (task) => ({
      ...task,
      units: normalizeUnits({ ...task.units, [kind]: task.units[kind] + amount }),
    }));

  const finalizeTask = (taskId: TaskId, status: "done" | "failed") =>
    modifyTask(taskId, (task, now) => finalizeTaskSnapshot(task, status, now));

  const store: ProgressStoreService = {
    getPublishedSnapshot: publisher.getPublishedSnapshot,
    subscribe: publisher.subscribe,
    flush: publisher.flush,
    addTask: (options) =>
      Effect.gen(function* () {
        const taskId = makeTaskId(++nextTaskId);
        const parentSnapshot =
          options.parentId === undefined ? undefined : state.tasks.get(options.parentId);
        const now = yield* Clock.currentTimeMillis;
        const task = createTaskSnapshot(taskId, options, parentSnapshot, now);

        yield* updateState((current) => {
          const nextTasks = new Map(current.tasks);
          nextTasks.set(taskId, task);
          const { index, depth } = findInsertionIndex(current.renderOrder, task.parentId);
          const nextRenderOrder = [...current.renderOrder];
          nextRenderOrder.splice(index, 0, { id: taskId, depth });

          const nextColumns = options.columns
            ? new Map(current.columns).set(taskId, options.columns)
            : current.columns;

          return { tasks: nextTasks, renderOrder: nextRenderOrder, columns: nextColumns };
        }, now);

        return taskId;
      }),
    updateTask: (taskId, options) => modifyTask(taskId, (task) => updatedSnapshot(task, options)),
    incrementSucceeded: (taskId, amount = 1) => incrementCounter(taskId, "succeeded", amount),
    incrementFailed: (taskId, amount = 1) => incrementCounter(taskId, "failed", amount),
    completeTask: (taskId) => finalizeTask(taskId, "done"),
    failTask: (taskId) => finalizeTask(taskId, "failed"),
    getTask: (taskId) => Effect.sync(() => Option.fromNullishOr(state.tasks.get(taskId))),
    listTasks: Effect.sync(() => Array.from(state.tasks.values())),
    setMetadata: (taskId, metadata) => modifyTask(taskId, (task) => ({ ...task, metadata })),
    updateMetadata: (taskId, f) =>
      modifyTask(taskId, (task) => ({ ...task, metadata: f(task.metadata) })),
    getMetadata: (taskId) =>
      Effect.sync(() => {
        const task = state.tasks.get(taskId);
        return task?.metadata;
      }),
  };

  return { store, publisherLoop: publisher.publisherLoop };
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
