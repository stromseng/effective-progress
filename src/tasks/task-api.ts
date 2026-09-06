import { Effect } from "effect";
import { dual } from "effect/Function";
import type { AddTaskOptions } from "./options";
import type { TaskHandle } from "./task-handle";

/** Task overloads shared by both entry points; Provided identifies requirements they supply. */
export interface TaskApi<Provided> {
  <A, E, R>(
    effect: Effect.Effect<A, E, R>,
    options: AddTaskOptions,
  ): Effect.Effect<A, E, Exclude<R, Provided>>;
  <A, E, R>(
    options: AddTaskOptions,
  ): (effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, Exclude<R, Provided>>;
  <A, E, R>(
    f: (handle: TaskHandle<void>) => Effect.Effect<A, E, R>,
    options: AddTaskOptions<void>,
  ): Effect.Effect<A, E, Exclude<R, Provided>>;
  <M, A, E, R>(
    f: (handle: TaskHandle<M>) => Effect.Effect<A, E, R>,
    options: AddTaskOptions<M> & { readonly metadata: M },
  ): Effect.Effect<A, E, Exclude<R, Provided>>;
}

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
