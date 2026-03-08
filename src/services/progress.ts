import { Context, Effect, Exit, FiberRef, Layer, Option } from "effect";
import { dual } from "effect/Function";
import { makeProgressRenderStore } from "../ink-renderer/store";
import type { AddTaskOptions, ProgressService, TaskId } from "../types";
import { Task } from "../types";
import { InkRenderer } from "./ink-renderer";
import { ProgressStdio } from "./stdio";

const makeProgressService = Effect.gen(function* () {
  const stdio = yield* ProgressStdio;
  const inkRenderer = yield* InkRenderer;
  const outerConsole = yield* Effect.console;
  const isTTY = Boolean(stdio.stderr.isTTY);

  const store = makeProgressRenderStore();
  const currentParentRef = yield* FiberRef.make(Option.none<TaskId>());
  const scope = yield* Effect.scope;

  const log = (...args: ReadonlyArray<unknown>) =>
    args.length === 0 ? Effect.void : outerConsole.log(...args);

  yield* Effect.forkIn(inkRenderer.run(store, stdio, isTTY), scope);
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

  const runTask: ProgressService["runTask"] = dual(
    2,
    <A, E, R>(effect: Effect.Effect<A, E, R>, options: AddTaskOptions) =>
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
  );

  const withTask: ProgressService["withTask"] = dual(
    2,
    <A, E, R>(effect: Effect.Effect<A, E, R>, options: AddTaskOptions) =>
      runTask(
        Effect.gen(function* () {
          const taskId = yield* Task;
          const exit = yield* Effect.exit(effect);

          if (Exit.isSuccess(exit)) {
            yield* completeTask(taskId);
          } else {
            yield* failTask(taskId);
          }

          return yield* Exit.match(exit, {
            onFailure: Effect.failCause,
            onSuccess: Effect.succeed,
          });
        }),
        options,
      ),
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
    runTask,
    withTask,
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
      const inkRendererOption = yield* Effect.serviceOption(InkRenderer);
      let layer: Layer.Layer<Progress, never, any> = Layer.scoped(Progress, makeProgressService);

      if (Option.isNone(inkRendererOption)) {
        layer = layer.pipe(Layer.provide(InkRenderer.Default));
      }
      if (Option.isNone(stdioOption)) {
        layer = layer.pipe(Layer.provide(ProgressStdio.Default));
      }

      return layer as Layer.Layer<Progress, never, never>;
    }),
  );
}
