import type { TaskApi } from "../tasks/task-api";
import type { TaskOperations } from "./task-operations";
import { Context, Effect, Exit, Layer, Option } from "effect";
import { adaptTaskApi } from "../tasks/task-api";
import { ProgressStore } from "./store/store";
import type { AddTaskOptions } from "../tasks/options";
import type { TaskHandle } from "../tasks/task-handle";
import type { TaskId } from "../task-model";
import { Task } from "../tasks/current-task";
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

interface CurrentParentState {
  readonly owner: symbol;
  readonly taskId: TaskId;
}

/** Builds the scoped implementation used by `ProgressService.task(...)` without auto-providing services. */
const makeProgressService = Effect.gen(function* () {
  const inkRenderer = yield* Renderer;
  const store = yield* ProgressStore;
  const parentOwner = Symbol();

  // Each Progress service has its own task store, but they all share CurrentParent.
  // Ignore parent IDs created by another service so tasks never point into the wrong store.
  const currentParentId = Effect.map(CurrentParent, (cp) =>
    Option.isSome(cp) && cp.value.owner === parentOwner
      ? Option.some(cp.value.taskId)
      : Option.none<TaskId>(),
  );

  yield* inkRenderer.start;

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
    getMetadata: store.getTask(taskId).pipe(
      Effect.map(
        Option.map((task) => {
          // SAFETY: This task was created with M; only its typed handle exposes metadata writes.
          return task.metadata as M;
        }),
      ),
    ),
    setMetadata: (metadata) => store.setMetadata(taskId, metadata),
    updateMetadata: (f) =>
      store.updateMetadata(taskId, (current) =>
        // SAFETY: The task handle reads the same metadata M established at task creation.
        f(current as M),
      ),
    incrementSucceeded: (amount) => store.incrementSucceeded(taskId, amount),
    incrementFailed: (amount) => store.incrementFailed(taskId, amount),
    update: (options) => store.updateTask(taskId, options),
    complete: store.completeTask(taskId),
    fail: store.failTask(taskId),
    getSnapshot: store.getTask(taskId),
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
