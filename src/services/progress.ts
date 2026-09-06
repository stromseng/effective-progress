import { Context, Effect, Exit, Layer, Option } from "effect";
import { adaptTaskApi } from "../task-api";
import { ProgressStore } from "./store/store";
import type { AddTaskOptions, ProgressService, TaskHandle, TaskId } from "../types";
import { Task } from "../types";
import { Renderer } from "./renderer/renderer";
import { ProgressStdio } from "./stdio";

interface CurrentParentState {
  readonly owner: symbol;
  readonly taskId: TaskId;
}

/** Builds the scoped implementation used by `ProgressService.task(...)` without auto-providing services. */
const makeProgressService = Effect.gen(function* () {
  const inkRenderer = yield* Renderer;
  const store = yield* ProgressStore;
  const scope = yield* Effect.scope;
  const parentOwner = Symbol();

  // Each Progress service has its own task store, but they all share CurrentParent.
  // Ignore parent IDs created by another service so tasks never point into the wrong store.
  const currentParentId = Effect.map(CurrentParent, (cp) =>
    Option.isSome(cp) && cp.value.owner === parentOwner
      ? Option.some(cp.value.taskId)
      : Option.none<TaskId>(),
  );

  yield* Effect.forkIn(inkRenderer.run, scope, { startImmediately: true });
  // Let the renderer fiber start so queued logs are reliably flushed on scope teardown.
  yield* Effect.sleep("0 millis");

  const addTask = <M>(options: AddTaskOptions<M>) =>
    Effect.gen(function* () {
      const resolvedParentId =
        options.parentId === undefined ? yield* currentParentId : Option.some(options.parentId);
      return yield* store.addTask({
        ...options,
        parentId: Option.isSome(resolvedParentId) ? resolvedParentId.value : undefined,
      });
    });

  const makeTaskHandle = <M>(taskId: TaskId): TaskHandle<M> => ({
    id: taskId,
    // SAFETY: This handle belongs to the task created with metadata M; handle writes preserve M.
    getMetadata: store.getMetadata(taskId) as Effect.Effect<M>,
    setMetadata: (metadata) => store.setMetadata(taskId, metadata),
    updateMetadata: (f) =>
      Effect.flatMap(store.getMetadata(taskId), (current) =>
        // SAFETY: The task handle reads the same metadata M established at task creation.
        store.setMetadata(taskId, f(current as M)),
      ),
    incrementSucceeded: (amount) => store.incrementSucceeded(taskId, amount),
    incrementFailed: (amount) => store.incrementFailed(taskId, amount),
    update: (options) => store.updateTask(taskId, options),
    complete: store.completeTask(taskId),
    fail: store.failTask(taskId),
    getSnapshot: store.getTask(taskId).pipe(Effect.map(Option.getOrThrow)),
  });

  const task = adaptTaskApi<Task>(
    <M, A, E, R>(
      callback: (handle: TaskHandle<M>) => Effect.Effect<A, E, R>,
      options: AddTaskOptions<M>,
    ) =>
      Effect.gen(function* () {
        const taskId = yield* addTask(options);
        const handle = makeTaskHandle<M>(taskId);
        const work = Effect.onExit(
          Effect.suspend(() => callback(handle)),
          // Explicit completion/failure wins because store finalization is terminal.
          (exit) => (Exit.isSuccess(exit) ? store.completeTask(taskId) : store.failTask(taskId)),
        );
        return yield* work.pipe(
          Effect.provideService(Task, taskId),
          Effect.provideService(CurrentParent, Option.some({ owner: parentOwner, taskId })),
        );
      }),
  );

  const service = {
    addTask,
    updateTask: store.updateTask,
    incrementSucceeded: store.incrementSucceeded,
    incrementFailed: store.incrementFailed,
    completeTask: store.completeTask,
    failTask: store.failTask,
    getTask: store.getTask,
    listTasks: store.listTasks,
    setMetadata: store.setMetadata,
    getMetadata: store.getMetadata,
    task,
  } satisfies ProgressService;

  return Progress.of(service);
});

/**
 * Returns a layer that uses an already-provided service for the given tag when available,
 * or falls back to the supplied default layer otherwise.
 */
const serviceOptionDefaultLayer = <I, S, E, R>(
  tag: Context.Key<I, S>,
  defaultLayer: Layer.Layer<I, E, R>,
) =>
  Layer.unwrap(
    Effect.map(Effect.serviceOption(tag), (option) =>
      Option.getOrElse(
        Option.map(option, (service) => Layer.succeed(tag, service)),
        () => defaultLayer,
      ),
    ),
  );

const CurrentParent = Context.Reference<Option.Option<CurrentParentState>>(
  "stromseng.dev/effective-progress/CurrentParent",
  { defaultValue: Option.none },
);

export class Progress extends Context.Service<Progress, ProgressService>()(
  "stromseng.dev/effective-progress/Progress",
) {
  static readonly layer = Layer.effect(Progress, makeProgressService).pipe(
    Layer.provide(
      serviceOptionDefaultLayer(Renderer, Renderer.layer).pipe(
        Layer.provideMerge([
          serviceOptionDefaultLayer(ProgressStdio, ProgressStdio.layer),
          ProgressStore.layer,
        ]),
      ),
    ),
  );
}
