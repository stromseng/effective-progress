import type { TaskApi } from "../tasks/task-api";
import type { TaskOperations } from "./task-operations";
import { Context, Effect, Layer, Option } from "effect";
import { createTaskRunner } from "../tasks/run-task";
import { ProgressStore } from "./store/store";
import type { Task } from "../tasks/current-task";
import { Renderer } from "../renderer/renderer";
import { ProgressStdio } from "./stdio";

export interface ProgressService extends TaskOperations {
  /**
   * Runs an effect inside a newly created task scope.
   *
   * The plain effect form auto-finalizes from the effect exit if the task is still `running`.
   * The callback form exposes a typed `TaskHandle` for metadata and explicit lifecycle control, and
   * also auto-finalizes from the callback exit if the handle did not already finalize the task.
   *
   * Use `Progress.task(...)` from `src/api/task.ts` when you want the service to be created automatically if needed.
   */
  readonly task: TaskApi<Task>;
}

/** Builds the scoped implementation used by `ProgressService.task(...)` without auto-providing services. */
const makeProgressService = Effect.gen(function* () {
  const inkRenderer = yield* Renderer;
  const store = yield* ProgressStore;
  const { addTask, task } = createTaskRunner(store);

  yield* inkRenderer.start;

  const service = {
    addTask,
    updateTask: store.updateTask,
    incrementSucceeded: store.incrementSucceeded,
    incrementFailed: store.incrementFailed,
    completeTask: store.completeTask,
    failTask: store.failTask,
    getTask: store.getTask,
    listTasks: store.listTasks,
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
