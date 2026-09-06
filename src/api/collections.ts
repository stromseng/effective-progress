import { Cause, Effect, Exit, Option } from "effect";
import { dual } from "effect/Function";
import type { Concurrency } from "effect/Types";
import { Progress, type ProgressService } from "../services/progress";
import type { Task } from "../tasks/current-task";
import type { TrackOptions } from "../tasks/options";
import type { TaskCountDisplay, TaskId } from "../task-model";
import { provideProgress } from "./provide-progress";
import { inferTotal } from "./infer-total";

export interface EffectExecutionOptions {
  readonly concurrency?: Concurrency;
}

export interface EffectAllExecutionOptions extends EffectExecutionOptions {
  readonly discard?: boolean;
  readonly mode?: "default" | "result";
}

export type AllOptions = Omit<TrackOptions, "total" | "countDisplay"> & EffectAllExecutionOptions;
export type AllReturn<
  Arg extends
    | ReadonlyArray<Effect.Effect<any, any, any>>
    | Record<string, Effect.Effect<any, any, any>>,
  O extends EffectAllExecutionOptions,
> = [Effect.All.Return<Arg, O>] extends [Effect.Effect<infer A, infer E, infer R>]
  ? Effect.Effect<A, E, Exclude<R, Progress | Task>>
  : never;

export interface ForEachExecutionOptions extends EffectExecutionOptions {
  readonly discard?: false | undefined;
}

export type ForEachOptions = Omit<TrackOptions, "countDisplay"> & ForEachExecutionOptions;

type AllArg =
  | ReadonlyArray<Effect.Effect<any, any, any>>
  | Record<string, Effect.Effect<any, any, any>>;

const wrapEffects = (
  effects: AllArg,
  tap: (effect: Effect.Effect<any, any, any>) => Effect.Effect<any, any, any>,
) =>
  Array.isArray(effects)
    ? effects.map(tap)
    : Object.fromEntries(Object.entries(effects).map(([k, effect]) => [k, tap(effect)]));

const countEffects = (effects: AllArg) =>
  Array.isArray(effects) ? effects.length : Object.keys(effects).length;

const isCollectAllMode = (mode: EffectAllExecutionOptions["mode"]) => mode === "result";

const allCountDisplay = (mode: EffectAllExecutionOptions["mode"]): TaskCountDisplay =>
  isCollectAllMode(mode) ? "detailed" : "processedOnly";

const trackEffectOutcome = <A, E, R>(
  progress: ProgressService,
  taskId: TaskId,
  effect: Effect.Effect<A, E, R>,
) =>
  Effect.onExit(effect, (exit) => {
    if (Exit.isSuccess(exit)) {
      return progress.incrementSucceeded(taskId);
    }
    return Cause.hasInterruptsOnly(exit.cause) ? Effect.void : progress.incrementFailed(taskId);
  });

/** Result mode marks fully accounted work done even when the collection exits abnormally. */
const completeAccountedResultTask = (progress: ProgressService, taskId: TaskId) =>
  Effect.gen(function* () {
    const taskOption = yield* progress.getTask(taskId);
    if (Option.isNone(taskOption)) {
      return;
    }

    const { processed, total } = taskOption.value.units;
    if (total !== undefined && processed >= total) {
      yield* progress.completeTask(taskId);
    }
  });

/**
 * Runs multiple effects under a single parent task and keeps the task counters in sync with the
 * child effect outcomes.
 */
export const all: {
  <const Arg extends AllArg, O extends EffectAllExecutionOptions>(
    effects: Arg,
    options: Omit<TrackOptions, "total" | "countDisplay"> & O,
  ): AllReturn<Arg, O>;
  <O extends EffectAllExecutionOptions>(
    options: Omit<TrackOptions, "total" | "countDisplay"> & O,
  ): <const Arg extends AllArg>(effects: Arg) => AllReturn<Arg, O>;
} = dual(
  2,
  <const Arg extends AllArg, O extends EffectAllExecutionOptions>(
    effects: Arg,
    options: Omit<TrackOptions, "total" | "countDisplay"> & O,
  ) =>
    // SAFETY: Wrapping preserves Effect.all keys, values, errors and mode; task supplies Progress and Task.
    provideProgress(
      Effect.gen(function* () {
        const progress = yield* Progress;
        return yield* progress.task(
          (handle) =>
            Effect.onExit(
              Effect.all(
                wrapEffects(effects, (effect) => trackEffectOutcome(progress, handle.id, effect)),
                {
                  concurrency: options.concurrency,
                  discard: options.discard,
                  mode: options.mode,
                },
              ),
              (exit) =>
                Exit.isFailure(exit) && isCollectAllMode(options.mode)
                  ? completeAccountedResultTask(progress, handle.id)
                  : Effect.void,
            ),
          {
            description: options.description,
            total: countEffects(effects),
            transient: options.transient,
            columns: options.columns,
            countDisplay: allCountDisplay(options.mode),
          },
        );
      }),
    ) as AllReturn<Arg, O>,
);

/**
 * Runs `Effect.forEach` under a single parent task and advances the task counters as items finish.
 */
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
    provideProgress(
      Effect.gen(function* () {
        const progress = yield* Progress;

        return yield* progress.task(
          (handle) =>
            Effect.forEach(
              iterable,
              (item, index) => trackEffectOutcome(progress, handle.id, f(item, index)),
              {
                concurrency: options.concurrency,
                discard: options.discard,
              },
            ),
          {
            description: options.description,
            total: options.total ?? inferTotal(iterable),
            transient: options.transient,
            columns: options.columns,
            countDisplay: "processedOnly",
          },
        );
      }),
    ),
);
