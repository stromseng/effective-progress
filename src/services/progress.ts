import { Context, Effect, Exit, Layer, Option } from "effect";
import { dual } from "effect/Function";
import { ProgressStore } from "./store/store";
import type { AddTaskOptions, ProgressShape, TaskHandle, TaskId } from "../types";
import { Task } from "../types";
import { Renderer } from "./renderer/renderer";
import { ProgressStdio } from "./stdio";

interface InternalTaskApi {
  <A, E, R>(
    effect: Effect.Effect<A, E, R>,
    options: AddTaskOptions,
  ): Effect.Effect<A, E, Exclude<R, Task>>;
  <A, E, R>(
    options: AddTaskOptions,
  ): (effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, Exclude<R, Task>>;
  <A, E, R>(
    f: (handle: TaskHandle<void>) => Effect.Effect<A, E, R>,
    options: AddTaskOptions<void>,
  ): Effect.Effect<A, E, Exclude<R, Task>>;
  <M, A, E, R>(
    f: (handle: TaskHandle<M>) => Effect.Effect<A, E, R>,
    options: AddTaskOptions<M> & { readonly metadata: M },
  ): Effect.Effect<A, E, Exclude<R, Task>>;
}

/** Builds the scoped implementation used by `ProgressService.task(...)` without auto-providing services. */
const makeProgressService = Effect.gen(function* () {
  const inkRenderer = yield* Renderer;
  const store = yield* ProgressStore;
  const scope = yield* Effect.scope;

  const log = (...args: ReadonlyArray<unknown>) =>
    args.length === 0 ? Effect.void : Effect.log(...args);

  yield* Effect.forkIn(inkRenderer.run, scope, { startImmediately: true });
  // Let the renderer fiber start so queued logs are reliably flushed on scope teardown.
  yield* Effect.sleep("0 millis");

  const addTask = (options: AddTaskOptions) =>
    Effect.gen(function* () {
      const resolvedParentId =
        options.parentId === undefined ? yield* CurrentParent : Option.some(options.parentId);
      return yield* store.addTask({
        ...options,
        parentId: Option.isSome(resolvedParentId) ? resolvedParentId.value : undefined,
      });
    });

  const updateTask = store.updateTask;
  const incrementSucceeded = store.incrementSucceeded;
  const incrementFailed = store.incrementFailed;
  const completeTask = store.completeTask;
  const failTask = store.failTask;
  const getTask = store.getTask;
  const listTasks = store.listTasks;
  const setMetadata = store.setMetadata;
  const getMetadata = store.getMetadata;

  const makeTaskHandle = <M>(taskId: TaskId): TaskHandle<M> => ({
    id: taskId,
    getMetadata: getMetadata(taskId) as Effect.Effect<M>,
    setMetadata: (metadata) => setMetadata(taskId, metadata),
    updateMetadata: (f) =>
      Effect.flatMap(getMetadata(taskId), (current) => setMetadata(taskId, f(current as M))),
    incrementSucceeded: (amount) => incrementSucceeded(taskId, amount),
    incrementFailed: (amount) => incrementFailed(taskId, amount),
    update: (options) => updateTask(taskId, options),
    complete: completeTask(taskId),
    fail: failTask(taskId),
    getSnapshot: getTask(taskId).pipe(Effect.map(Option.getOrThrow)),
  });

  const autoFinalizeIfRunning = <E>(taskId: TaskId, exit: Exit.Exit<unknown, E>) =>
    Effect.gen(function* () {
      const task = yield* getTask(taskId);
      if (Option.isNone(task) || task.value.status !== "running") {
        return;
      }

      if (Exit.isSuccess(exit)) {
        yield* completeTask(taskId);
      } else {
        yield* failTask(taskId);
      }
    });

  const scopedTask = dual(2, <A, E, R>(effect: Effect.Effect<A, E, R>, options: AddTaskOptions) =>
    Effect.gen(function* () {
      const inheritedParentId = yield* CurrentParent;
      const resolvedParentId =
        options.parentId === undefined ? inheritedParentId : Option.some(options.parentId);

      const taskId = yield* addTask({
        ...options,
        parentId: Option.isSome(resolvedParentId) ? resolvedParentId.value : undefined,
        transient: options.transient,
      });

      return yield* Effect.provideService(
        Effect.provideService(effect, Task, taskId),
        CurrentParent,
        Option.some(taskId),
      );
    }),
  ) as InternalTaskApi;

  const task: ProgressShape["task"] = dual(
    2,
    <A, E, R>(
      effectOrCallback:
        | Effect.Effect<A, E, R>
        | ((handle: TaskHandle<any>) => Effect.Effect<A, E, R>),
      options: AddTaskOptions<any>,
    ) => {
      if (typeof effectOrCallback === "function") {
        return scopedTask(
          Effect.gen(function* () {
            const taskId = yield* Task;
            const handle = makeTaskHandle(taskId);
            const exit = yield* Effect.exit(effectOrCallback(handle));

            yield* autoFinalizeIfRunning(taskId, exit);

            return yield* Exit.match(exit, {
              onFailure: Effect.failCause,
              onSuccess: Effect.succeed,
            });
          }),
          options,
        );
      }

      return scopedTask(
        Effect.gen(function* () {
          const taskId = yield* Task;
          const exit = yield* Effect.exit(effectOrCallback);

          yield* autoFinalizeIfRunning(taskId, exit);

          return yield* Exit.match(exit, {
            onFailure: Effect.failCause,
            onSuccess: Effect.succeed,
          });
        }),
        options,
      );
    },
  );

  const service = {
    addTask,
    updateTask,
    incrementSucceeded,
    incrementFailed,
    completeTask,
    failTask,
    log,
    getTask,
    listTasks,
    setMetadata,
    getMetadata,
    task,
  } satisfies ProgressShape;

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

const CurrentParent = Context.Reference<Option.Option<TaskId>>(
  "stromseng.dev/effective-progress/CurrentParent",
  { defaultValue: Option.none },
);

export class Progress extends Context.Service<Progress, ProgressShape>()(
  "stromseng.dev/effective-progress/Progress",
) {
  static readonly layer = Layer.effect(Progress, makeProgressService).pipe(
    Layer.provide(
      serviceOptionDefaultLayer(Renderer, Renderer.layer).pipe(
        Layer.provideMerge(serviceOptionDefaultLayer(ProgressStdio, ProgressStdio.layer)),
        Layer.provideMerge(ProgressStore.layer),
      ),
    ),
  );
}
