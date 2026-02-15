import { Effect, Exit } from "effect";
import { dual } from "effect/Function";
import type { Concurrency } from "effect/Types";
import { Progress, provideProgressService } from "./runtime";
import { Task } from "./types";
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
> = [Effect.All.ReturnTuple<Arg, Effect.All.IsDiscard<O>, Effect.All.ExtractMode<O>>] extends [
  Effect.Effect<infer A, infer E, infer R>,
]
  ? Effect.Effect<A, E, Exclude<R, Progress | Task>>
  : never;

export interface ForEachExecutionOptions extends EffectExecutionOptions {
  readonly discard?: false | undefined;
}

export type ForEachOptions = TrackOptions & ForEachExecutionOptions;

export const task: {
  <A, E, R>(
    effect: Effect.Effect<A, E, R>,
    options: AddTaskOptions,
  ): Effect.Effect<A, E, Exclude<R, Progress | Task>>;
  <A, E, R>(
    options: AddTaskOptions,
  ): (effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, Exclude<R, Progress | Task>>;
} = dual(
  2,
  <A, E, R>(effect: Effect.Effect<A, E, R>, options: AddTaskOptions) =>
    provideProgressService(
      Effect.gen(function* () {
        const progress = yield* Progress;
        return yield* progress.withTask(effect, options);
      }),
    ) as Effect.Effect<A, E, Exclude<R, Progress | Task>>,
);

export const all: {
  <
    const Arg extends ReadonlyArray<Effect.Effect<any, any, any>>,
    O extends EffectAllExecutionOptions,
  >(
    effects: Arg,
    options: Omit<TrackOptions, "total"> & O,
  ): AllReturn<Arg, O>;
  <O extends EffectAllExecutionOptions>(
    options: Omit<TrackOptions, "total"> & O,
  ): <const Arg extends ReadonlyArray<Effect.Effect<any, any, any>>>(
    effects: Arg,
  ) => AllReturn<Arg, O>;
} = dual(
  2,
  <
    const Arg extends ReadonlyArray<Effect.Effect<any, any, any>>,
    O extends EffectAllExecutionOptions,
  >(
    effects: Arg,
    options: Omit<TrackOptions, "total"> & O,
  ) =>
    provideProgressService(
      Effect.gen(function* () {
        const progress = yield* Progress;
        return yield* progress.runTask(
          Effect.gen(function* () {
            const taskId = yield* Task;
            const exit = yield* Effect.exit(
              Effect.all(
                effects.map((effect) => Effect.tap(effect, () => progress.advanceTask(taskId, 1))),
                {
                  concurrency: options.concurrency,
                  batching: options.batching,
                  discard: options.discard,
                  mode: options.mode,
                  concurrentFinalizers: options.concurrentFinalizers,
                },
              ),
            );

            if (Exit.isSuccess(exit)) {
              yield* progress.completeTask(taskId);
            } else {
              yield* progress.failTask(taskId);
            }

            return yield* Exit.match(exit, {
              onFailure: Effect.failCause,
              onSuccess: Effect.succeed,
            });
          }),
          {
            description: options.description,
            total: effects.length,
            transient: options.transient,
            progressbar: options.progressbar,
          },
        );
      }),
    ) as AllReturn<Arg, O>,
);

export const forEach: {
  <A, B, E, R>(
    iterable: Iterable<A>,
    f: (item: A, index: number) => Effect.Effect<B, E, R>,
    options: ForEachOptions,
  ): Effect.Effect<ReadonlyArray<B>, E, Exclude<R, Progress | Task>>;
  <A, B, E, R>(
    f: (item: A, index: number) => Effect.Effect<B, E, R>,
    options: ForEachOptions,
  ): (iterable: Iterable<A>) => Effect.Effect<ReadonlyArray<B>, E, Exclude<R, Progress | Task>>;
} = dual(
  3,
  <A, B, E, R>(
    iterable: Iterable<A>,
    f: (item: A, index: number) => Effect.Effect<B, E, R>,
    options: ForEachOptions,
  ) =>
    provideProgressService(
      Effect.gen(function* () {
        const progress = yield* Progress;

        return yield* progress.runTask(
          Effect.gen(function* () {
            const taskId = yield* Task;
            const exit = yield* Effect.exit(
              Effect.forEach(
                iterable,
                (item, index) => Effect.tap(f(item, index), () => progress.advanceTask(taskId, 1)),
                {
                  concurrency: options.concurrency,
                  batching: options.batching,
                  discard: options.discard,
                  concurrentFinalizers: options.concurrentFinalizers,
                },
              ),
            );

            if (Exit.isSuccess(exit)) {
              yield* progress.completeTask(taskId);
            } else {
              yield* progress.failTask(taskId);
            }

            return yield* Exit.match(exit, {
              onFailure: Effect.failCause,
              onSuccess: Effect.succeed,
            });
          }),
          {
            description: options.description,
            total: options.total ?? inferTotal(iterable),
            transient: options.transient,
            progressbar: options.progressbar,
          },
        );
      }),
    ) as Effect.Effect<ReadonlyArray<B>, E, Exclude<R, Progress | Task>>,
);
