import { Effect } from "effect";
import { Progress } from "../progress";
import { CurrentTask } from "../tasks/current-task";
import type { TaskOptions } from "../tasks/options";
import type { TaskHandle } from "../tasks/task-handle";
import { adaptTaskOverloads } from "../tasks/task-overloads";
import { provideProgress } from "./provide-progress";

/**
 * Runs an effect inside a task, creating and providing a `Progress` service automatically when one
 * is not already present in the environment.
 *
 * The effect form tracks success and failure from the effect exit. The callback form exposes a
 * typed `TaskHandle` for task-local updates, typed metadata, and explicit completion or failure,
 * and otherwise auto-finalizes from the callback exit if the task is still `running`.
 */
export const task = adaptTaskOverloads<Progress | CurrentTask>(
  <M, A, E, R>(
    callback: (handle: TaskHandle<M>) => Effect.Effect<A, E, R>,
    options: TaskOptions<M> & { readonly metadata: M },
  ) =>
    // SAFETY: The service supplies CurrentTask and provideProgress supplies Progress; nested Excludes are equivalent.
    provideProgress(
      Effect.gen(function* () {
        const progress = yield* Progress;
        return yield* progress.task(callback, options);
      }),
    ) as Effect.Effect<A, E, Exclude<R, Progress | CurrentTask>>,
);
