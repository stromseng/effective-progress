import { Console, Effect, Option } from "effect";
import type { Concurrency } from "effect/Types";
import { makeProgressConsole } from "./console";
import { makeProgressService } from "./runtime";
import { Progress } from "./types";
import type { TrackOptions } from "./types";
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
    [Effect.Effect<infer A, infer E, infer R>] ? Effect.Effect<A, E, Exclude<R, Progress>>
  : never;

export interface ForEachExecutionOptions extends EffectExecutionOptions {
  readonly discard?: false | undefined;
}

export type ForEachOptions = TrackOptions & ForEachExecutionOptions;

export const withProgressService = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const outerConsole = yield* Console.consoleWith((console) => Effect.succeed(console));
    const existing = yield* Effect.serviceOption(Progress);
    if (Option.isSome(existing)) {
      const console = makeProgressConsole(existing.value, outerConsole);
      return yield* Effect.withConsole(
        Effect.provideService(effect, Progress, existing.value),
        console,
      );
    }

    return yield* Effect.scoped(
      Effect.gen(function* () {
        const service = yield* makeProgressService;
        const console = makeProgressConsole(service, outerConsole);
        return yield* Effect.withConsole(Effect.provideService(effect, Progress, service), console);
      }),
    );
  });

export const all = <
  const Arg extends ReadonlyArray<Effect.Effect<any, any, any>>,
  O extends EffectAllExecutionOptions,
>(
  effects: Arg,
  options: Omit<TrackOptions, "total"> & O,
): AllReturn<Arg, O> =>
  withProgressService(
    Effect.gen(function* () {
      const progress = yield* Progress;
      return yield* progress.withTask(
        {
          description: options.description,
          total: effects.length,
          transient: options.transient,
        },
        (taskId) =>
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
    }),
  ) as AllReturn<Arg, O>;

export const forEach = <A, B, E, R>(
  iterable: Iterable<A>,
  f: (item: A, index: number) => Effect.Effect<B, E, R>,
  options: ForEachOptions,
): Effect.Effect<ReadonlyArray<B>, E, Exclude<R, Progress>> =>
  withProgressService(
    Effect.gen(function* () {
      const progress = yield* Progress;

      return yield* progress.withTask(
        {
          description: options.description,
          total: options.total ?? inferTotal(iterable),
          transient: options.transient,
        },
        (taskId) =>
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
    }),
  );
