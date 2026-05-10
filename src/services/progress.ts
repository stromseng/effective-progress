import { Context, Effect, Exit, FiberRef, Layer, Option } from "effect";
import { dual } from "effect/Function";
import { ProgressStore, LayerProgressStoreDefault } from "../renderer/store";
import type { AddTaskOptions, ProgressService, TaskHandle, TaskId } from "../types";
import { Task } from "../types";
import { Renderer } from "./renderer";
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
  const outerConsole = yield* Effect.console;
  const store = yield* ProgressStore;
  const currentParentRef = yield* FiberRef.make(Option.none<TaskId>());
  const scope = yield* Effect.scope;

  const log = (...args: ReadonlyArray<unknown>) =>
    args.length === 0 ? Effect.void : outerConsole.log(...args);

  yield* Effect.forkIn(inkRenderer.run, scope);
  // Let the renderer fiber start so queued logs are reliably flushed on scope teardown.
  yield* Effect.sleep("0 millis");

  const addTask = (options: AddTaskOptions) =>
    Effect.gen(function* () {
      const resolvedParentId =
        options.parentId === undefined
          ? yield* FiberRef.get(currentParentRef)
          : Option.some(options.parentId);
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
      const inheritedParentId = yield* FiberRef.get(currentParentRef);
      const resolvedParentId =
        options.parentId === undefined ? inheritedParentId : Option.some(options.parentId);

      const taskId = yield* addTask({
        ...options,
        parentId: Option.isSome(resolvedParentId) ? resolvedParentId.value : undefined,
        transient: options.transient,
      });

      return yield* Effect.locally(
        Effect.provideService(effect, Task, taskId),
        currentParentRef,
        Option.some(taskId),
      );
    }),
  ) as InternalTaskApi;

  const task: ProgressService["task"] = dual(
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
  } satisfies ProgressService;

  return Progress.of(service);
});

export class Progress extends Context.Tag("stromseng.dev/effective-progress/Progress")<
  Progress,
  ProgressService
>() {
  static readonly Default = Layer.unwrapEffect(
    Effect.gen(function* () {
      const stdioOption = yield* Effect.serviceOption(ProgressStdio);
      const rendererOption = yield* Effect.serviceOption(Renderer);

      const stdioLayer = Option.match(stdioOption, {
        onNone: () => ProgressStdio.Default,
        onSome: (stdio) => Layer.succeed(ProgressStdio, stdio),
      });
      const rendererLayer = Option.match(rendererOption, {
        onNone: () => Renderer.Default,
        onSome: (inkRenderer) => Layer.succeed(Renderer, inkRenderer),
      });

      const dependencies = rendererLayer.pipe(
        Layer.provideMerge(stdioLayer),
        Layer.provideMerge(LayerProgressStoreDefault),
      );
      const layer = Layer.scoped(Progress, makeProgressService).pipe(Layer.provide(dependencies));

      return layer;
    }),
  );
}
