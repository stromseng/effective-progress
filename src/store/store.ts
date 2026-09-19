import { appendProgressSample } from "../tasks/eta-estimation";
import { Clock, Context, Effect, Layer, Option, Queue } from "effect";
import type { AnyColumn } from "../columns/types";
import type { TaskId } from "../tasks/model";
import type { ProgressState } from "./state";
import type { TaskOperations } from "../tasks/task-operations";
import { TaskId as makeTaskId, type TaskSnapshot } from "../tasks/model";
import {
  createTaskSnapshot,
  finalizeTaskSnapshot,
  normalizeUnits,
  updateTaskSnapshot,
} from "./task-state";
import { findChildInsertionPoint, removeTransientSubtree } from "./task-tree";
import { createStatePublisher } from "./state-publisher";

export interface ProgressStoreService extends TaskOperations {
  /** The renderer reads the throttled published state; task operations read the live state. */
  readonly getPublishedState: () => ProgressState;
  readonly subscribe: (listener: () => void) => () => void;
  readonly flush: () => void;
  /** Internal metadata operations are exposed publicly only through a typed task handle. */
  readonly setMetadata: <M>(taskId: TaskId, metadata: M) => Effect.Effect<void>;
  readonly updateMetadata: (
    taskId: TaskId,
    f: (metadata: TaskSnapshot["metadata"]) => TaskSnapshot["metadata"],
  ) => Effect.Effect<void>;
}

const makeProgressStoreInternals = (publishQueue: Queue.Queue<void>) => {
  let nextTaskId = 0;
  let state: ProgressState = {
    tasks: new Map<TaskId, TaskSnapshot>(),
    renderOrder: [],
    columns: new Map<TaskId, ReadonlyArray<AnyColumn>>(),
  };
  const publisher = createStatePublisher(state, publishQueue);

  const updateState = (
    transform: (current: ProgressState) => ProgressState,
    now: number,
  ): Effect.Effect<void> => {
    const nextState = transform(state);
    if (nextState === state) {
      return Effect.void;
    }

    state = nextState;
    return publisher.publish(state, now);
  };

  /** Replaces one task and records its processed-count observation in the same transition. */
  const replaceTaskAndSample = (
    current: ProgressState,
    task: TaskSnapshot,
    nextTask: TaskSnapshot,
    now: number,
  ): ProgressState => {
    if (nextTask === task) {
      return current;
    }
    const tasks = new Map(current.tasks);
    tasks.set(task.id, {
      ...nextTask,
      progressSamples: appendProgressSample(task.progressSamples, now, nextTask.units.processed),
    });
    return { ...current, tasks };
  };

  /** Mutates running tasks only, recording progress atomically. */
  const modifyRunningTask = (
    taskId: TaskId,
    transform: (task: TaskSnapshot, now: number) => TaskSnapshot,
  ) =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      yield* updateState((current) => {
        const task = current.tasks.get(taskId);
        if (!task || task.status !== "running") {
          return current;
        }
        return replaceTaskAndSample(current, task, transform(task, now), now);
      }, now);
    });

  const incrementCounter = (taskId: TaskId, kind: "succeeded" | "failed", amount: number) =>
    modifyRunningTask(taskId, (task) => ({
      ...task,
      units: normalizeUnits({ ...task.units, [kind]: task.units[kind] + amount }, task.units),
    }));

  const finalizeTask = (taskId: TaskId, status: "done" | "failed") =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      yield* updateState((current) => {
        const task = current.tasks.get(taskId);
        if (!task || task.status !== "running") {
          return current;
        }
        if (task.transient) {
          return removeTransientSubtree(current, taskId);
        }
        return replaceTaskAndSample(current, task, finalizeTaskSnapshot(task, status, now), now);
      }, now);
    });

  const store: ProgressStoreService = {
    getPublishedState: publisher.getPublishedState,
    subscribe: publisher.subscribe,
    flush: publisher.flush,
    addTask: (options) =>
      Effect.gen(function* () {
        const taskId = makeTaskId(++nextTaskId);
        const now = yield* Clock.currentTimeMillis;

        yield* updateState((current) => {
          const parentSnapshot =
            options.parentId === undefined ? undefined : current.tasks.get(options.parentId);
          const task = createTaskSnapshot(taskId, options, parentSnapshot, now);
          const nextTasks = new Map(current.tasks);
          nextTasks.set(taskId, task);
          const { index, depth } = findChildInsertionPoint(current.renderOrder, task.parentId);
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
      modifyRunningTask(taskId, (task) => updateTaskSnapshot(task, options)),
    incrementSucceeded: (taskId, amount = 1) => incrementCounter(taskId, "succeeded", amount),
    incrementFailed: (taskId, amount = 1) => incrementCounter(taskId, "failed", amount),
    completeTask: (taskId) => finalizeTask(taskId, "done"),
    failTask: (taskId) => finalizeTask(taskId, "failed"),
    getTask: (taskId) => Effect.sync(() => Option.fromNullishOr(state.tasks.get(taskId))),
    listTasks: Effect.sync(() => Array.from(state.tasks.values())),
    setMetadata: (taskId, metadata) => modifyRunningTask(taskId, (task) => ({ ...task, metadata })),
    updateMetadata: (taskId, f) =>
      modifyRunningTask(taskId, (task) => ({ ...task, metadata: f(task.metadata) })),
  };

  return { store, publisherLoop: publisher.publisherLoop };
};

export const makeProgressStore = Effect.gen(function* () {
  const publishQueue = yield* Queue.sliding<void>(1);
  const { store, publisherLoop } = makeProgressStoreInternals(publishQueue);
  yield* Effect.forkScoped(publisherLoop);
  return store;
});

export class ProgressStore extends Context.Service<ProgressStore, ProgressStoreService>()(
  "stromseng.dev/effective-progress/ProgressStore",
) {
  static readonly layer = Layer.effect(ProgressStore, makeProgressStore);
}
