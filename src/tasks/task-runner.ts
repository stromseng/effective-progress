import { Context, Effect, Exit, Option } from "effect";
import type { ProgressStoreService } from "../store/store";
import type { TaskId } from "./model";
import type { AddTaskOptions, TaskOptions } from "./options";
import { CurrentTask } from "./current-task";
import { adaptTaskOverloads } from "./task-overloads";
import { bindTaskHandle, type TaskHandle } from "./task-handle";

interface CurrentParentTaskState {
  readonly owner: symbol;
  readonly taskId: TaskId;
}

const CurrentParentTask = Context.Reference<Option.Option<CurrentParentTaskState>>(
  "stromseng.dev/effective-progress/CurrentParentTask",
  { defaultValue: Option.none },
);

/** Owns parent inference and task execution for one Progress service instance. */
export const createTaskRunner = (store: ProgressStoreService) => {
  const parentOwner = Symbol();

  // Each Progress service has its own task store, but they all share CurrentParentTask.
  // Ignore parent IDs created by another service so tasks never point into the wrong store.
  const currentParentId = Effect.map(CurrentParentTask, (cp) =>
    Option.isSome(cp) && cp.value.owner === parentOwner
      ? Option.some(cp.value.taskId)
      : Option.none<TaskId>(),
  );

  const addTask = <M>(options: AddTaskOptions<M>) =>
    Effect.gen(function* () {
      const resolvedParentId =
        options.parentId === undefined ? yield* currentParentId : Option.some(options.parentId);
      return yield* store.addTask({
        ...options,
        parentId: Option.isSome(resolvedParentId) ? resolvedParentId.value : undefined,
      });
    });

  const task = adaptTaskOverloads<CurrentTask>(
    <M, A, E, R>(
      callback: (handle: TaskHandle<M>) => Effect.Effect<A, E, R>,
      options: TaskOptions<M>,
    ) =>
      Effect.gen(function* () {
        const taskId = yield* addTask(options);
        const handle = bindTaskHandle<M>(store, taskId);
        const work = Effect.onExit(
          Effect.suspend(() => callback(handle)),
          // Explicit completion/failure wins because store finalization is terminal.
          (exit) => (Exit.isSuccess(exit) ? store.completeTask(taskId) : store.failTask(taskId)),
        );
        return yield* work.pipe(
          Effect.provideService(CurrentTask, taskId),
          Effect.provideService(CurrentParentTask, Option.some({ owner: parentOwner, taskId })),
        );
      }),
  );

  return { addTask, task };
};
