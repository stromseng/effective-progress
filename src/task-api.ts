import { Effect } from "effect";
import { dual } from "effect/Function";
import type { AddTaskOptions, TaskApi, TaskHandle } from "./types";

/** Adapts the public overloads to one callback runner. Omitted metadata is the void overload. */
export const adaptTaskApi = <Provided>(
  run: <M, A, E, R>(
    callback: (handle: TaskHandle<M>) => Effect.Effect<A, E, R>,
    options: AddTaskOptions<M> & { readonly metadata: M },
  ) => Effect.Effect<A, E, Exclude<R, Provided>>,
): TaskApi<Provided> =>
  dual(
    2,
    <M, A, E, R>(
      input: Effect.Effect<A, E, R> | ((handle: TaskHandle<M>) => Effect.Effect<A, E, R>),
      options: AddTaskOptions<M> & { readonly metadata: M },
    ) => run((handle) => (Effect.isEffect(input) ? input : input(handle)), options),
  );
