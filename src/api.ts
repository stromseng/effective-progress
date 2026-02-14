import { Console, Effect, Option } from "effect";
import { makeProgressConsole } from "./console";
import { makeProgressService } from "./runtime";
import { Progress } from "./types";
import type { TrackOptions } from "./types";
import { inferTotal } from "./utils";

export interface TrackEffectsOptions {
  readonly description: string;
  readonly total?: number;
  readonly transient?: boolean;
  readonly all?: {
    readonly concurrency?: number | "unbounded";
    readonly batching?: boolean | "inherit";
    readonly concurrentFinalizers?: boolean;
  };
}

export interface ForEachOptions extends TrackOptions {
  readonly forEach?: {
    readonly concurrency?: number | "unbounded";
    readonly batching?: boolean | "inherit";
    readonly concurrentFinalizers?: boolean;
  };
}

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

export const all = <A, E, R>(
  effects: ReadonlyArray<Effect.Effect<A, E, R>>,
  options: TrackEffectsOptions,
): Effect.Effect<ReadonlyArray<A>, E, Exclude<R, Progress>> =>
  withProgressService(
    Effect.gen(function* () {
      const progress = yield* Progress;
      return yield* progress.withTask(
        {
          description: options.description,
          total: options.total ?? effects.length,
          transient: options.transient,
        },
        (taskId) =>
          Effect.forEach(
            effects.map((effect) => Effect.tap(effect, () => progress.advanceTask(taskId, 1))),
            (effect) => effect,
            {
              concurrency: options.all?.concurrency,
              batching: options.all?.batching,
              concurrentFinalizers: options.all?.concurrentFinalizers,
            },
          ),
      );
    }),
  );

export const forEach = <A, B, E, R>(
  iterable: Iterable<A>,
  f: (item: A, index: number) => Effect.Effect<B, E, R>,
  options: ForEachOptions,
): Effect.Effect<ReadonlyArray<B>, E, Exclude<R, Progress>> =>
  withProgressService(
    Effect.gen(function* () {
      const progress = yield* Progress;

      const items = Array.from(iterable);
      const total = options.total ?? inferTotal(iterable);

      return yield* progress.withTask(
        {
          description: options.description,
          total,
          transient: options.transient,
        },
        (taskId) =>
          Effect.forEach(
            items,
            (item, index) => Effect.tap(f(item, index), () => progress.advanceTask(taskId, 1)),
            {
              concurrency: options.forEach?.concurrency,
              batching: options.forEach?.batching,
              concurrentFinalizers: options.forEach?.concurrentFinalizers,
            },
          ),
      );
    }),
  );

export const trackProgress = all;

export const track = <A, B, E, R>(
  iterable: Iterable<A>,
  options: TrackOptions,
  f: (item: A, index: number) => Effect.Effect<B, E, R>,
): Effect.Effect<ReadonlyArray<B>, E, Exclude<R, Progress>> => forEach(iterable, f, options);
