import { Effect } from "effect";
import type { Concurrency } from "effect/Types";
import { provideProgressService } from "./runtime";
import { Progress, Task } from "./types";
import type { AddTaskOptions, TrackOptions } from "./types";
import { inferTotal } from "./utils";

export interface EffectExecutionOptions {
  readonly concurrency?: Concurrency;
  readonly batching?: boolean | "inherit";
  readonly concurrentFinalizers?: boolean;
}

export interface EffectAllExecutionOptions extends EffectExecutionOptions {
  readonly discard?: boolean;
  readonly mode?: "default" | "validate" | "either";
}

export type AllOptions = Omit<TrackOptions, "total"> & EffectAllExecutionOptions;
export type AllReturn<
  Arg extends ReadonlyArray<Effect.Effect<any, any, any>>,
  O extends EffectAllExecutionOptions,
> =
  [Effect.All.ReturnTuple<Arg, Effect.All.IsDiscard<O>, Effect.All.ExtractMode<O>>] extends
    [Effect.Effect<infer A, infer E, infer R>] ? Effect.Effect<A, E, Exclude<R, Progress | Task>>
  : never;

export interface ForEachExecutionOptions extends EffectExecutionOptions {
  readonly discard?: false | undefined;
}

export type ForEachOptions = TrackOptions & ForEachExecutionOptions;

export const withTask = <A, E, R>(
  options: AddTaskOptions,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, Exclude<R, Progress | Task>> =>
  provideProgressService(
    Effect.gen(function* () {
      const progress = yield* Progress;
      return yield* progress.withTask(options, effect);
    }),
  ) as Effect.Effect<A, E, Exclude<R, Progress | Task>>;

export const all = <
  const Arg extends ReadonlyArray<Effect.Effect<any, any, any>>,
  O extends EffectAllExecutionOptions,
>(
  effects: Arg,
  options: Omit<TrackOptions, "total"> & O,
): AllReturn<Arg, O> =>
  provideProgressService(
    Effect.gen(function* () {
      const progress = yield* Progress;
      return yield* progress.withTask(
        {
          description: options.description,
          total: effects.length,
          transient: options.transient,
          progressbar: options.progressbar,
        },
        Effect.gen(function* () {
          const taskId = yield* Task;
          return yield* Effect.all(
            effects.map((effect) => Effect.tap(effect, () => progress.advanceTask(taskId, 1))),
            {
              concurrency: options.concurrency,
              batching: options.batching,
              discard: options.discard,
              mode: options.mode,
              concurrentFinalizers: options.concurrentFinalizers,
            },
          );
        }),
      );
    }),
  ) as AllReturn<Arg, O>;

export const forEach = <A, B, E, R>(
  iterable: Iterable<A>,
  f: (item: A, index: number) => Effect.Effect<B, E, R>,
  options: ForEachOptions,
): Effect.Effect<ReadonlyArray<B>, E, Exclude<R, Progress | Task>> =>
  provideProgressService(
    Effect.gen(function* () {
      const progress = yield* Progress;

      return yield* progress.withTask(
        {
          description: options.description,
          total: options.total ?? inferTotal(iterable),
          transient: options.transient,
          progressbar: options.progressbar,
        },
        Effect.gen(function* () {
          const taskId = yield* Task;
          return yield* Effect.forEach(
            iterable,
            (item, index) =>
              Effect.tap(f(item, index), () => progress.advanceTask(taskId, 1)),
            {
              concurrency: options.concurrency,
              batching: options.batching,
              discard: options.discard,
              concurrentFinalizers: options.concurrentFinalizers,
            },
          );
        }),
      );
    }),
  ) as Effect.Effect<ReadonlyArray<B>, E, Exclude<R, Progress | Task>>;
