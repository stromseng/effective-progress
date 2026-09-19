import { Effect } from "effect";
import { dual } from "effect/Function";
import type { TaskOptions } from "./options";
import type { TaskHandle } from "./task-handle";

/**
 * The overload set of `task(...)`, shared by the public API and the service. `Provided` lists the
 * requirements the caller supplies, so they are removed from the returned effect.
 */
export interface TaskOverloads<Provided> {
  <A, E, R>(
    effect: Effect.Effect<A, E, R>,
    options: TaskOptions,
  ): Effect.Effect<A, E, Exclude<R, Provided>>;
  <A, E, R>(
    options: TaskOptions,
  ): (effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, Exclude<R, Provided>>;
  <A, E, R>(
    f: (handle: TaskHandle<void>) => Effect.Effect<A, E, R>,
    options: TaskOptions<void>,
  ): Effect.Effect<A, E, Exclude<R, Provided>>;
  <M, A, E, R>(
    f: (handle: TaskHandle<M>) => Effect.Effect<A, E, R>,
    options: TaskOptions<M> & { readonly metadata: M },
  ): Effect.Effect<A, E, Exclude<R, Provided>>;
}

/** Adapts the public overloads to one callback runner. Omitted metadata is the void overload. */
export const adaptTaskOverloads = <Provided>(
  run: <M, A, E, R>(
    callback: (handle: TaskHandle<M>) => Effect.Effect<A, E, R>,
    options: TaskOptions<M> & { readonly metadata: M },
  ) => Effect.Effect<A, E, Exclude<R, Provided>>,
): TaskOverloads<Provided> =>
  dual(
    2,
    <M, A, E, R>(
      input: Effect.Effect<A, E, R> | ((handle: TaskHandle<M>) => Effect.Effect<A, E, R>),
      options: TaskOptions<M> & { readonly metadata: M },
    ) => run((handle) => (Effect.isEffect(input) ? input : input(handle)), options),
  );
