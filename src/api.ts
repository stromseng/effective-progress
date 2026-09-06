import { Cause, Effect, Exit, Option } from "effect";
import { dual } from "effect/Function";
import type { Concurrency } from "effect/Types";
import { Progress } from "./services/progress";
import { Task } from "./tasks/current-task";
import type { AddTaskOptions, TrackOptions } from "./tasks/options";
import type { ProgressService } from "./services/progress";
import type { TaskCountDisplay, TaskId } from "./task-model";
import type { TaskHandle } from "./tasks/task-handle";
import { adaptTaskApi } from "./tasks/task-api";
import { inferTotal } from "./utils";

const provideProgress = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const existing = yield* Effect.serviceOption(Progress);
    if (Option.isSome(existing)) {
      return yield* Effect.provideService(effect, Progress, existing.value);
    }
    return yield* Effect.scoped(Effect.provide(effect, Progress.layer, { local: true }));
  });

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

export type TaskOptions<M = void> = AddTaskOptions<M>;

/**
 * Runs an effect inside a task, creating and providing a `Progress` service automatically when one
 * is not already present in the environment.
 *
 * The effect form tracks success and failure from the effect exit. The callback form exposes a
 * typed `TaskHandle` for task-local updates, typed metadata, and explicit completion or failure,
 * and otherwise auto-finalizes from the callback exit if the task is still `running`.
 */
export const task = adaptTaskApi<Progress | Task>(
  <M, A, E, R>(
    callback: (handle: TaskHandle<M>) => Effect.Effect<A, E, R>,
    options: AddTaskOptions<M> & { readonly metadata: M },
  ) =>
    // SAFETY: The service supplies Task and provideProgress supplies Progress; nested Excludes are equivalent.
    provideProgress(
      Effect.gen(function* () {
        const progress = yield* Progress;
        return yield* progress.task(callback, options);
      }),
    ) as Effect.Effect<A, E, Exclude<R, Progress | Task>>,
);

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

const wrapTrackedEffect = <A, E, R>(
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

const isTaskFullyProcessed = (progress: ProgressService, taskId: TaskId) =>
  Effect.gen(function* () {
    const taskOption = yield* progress.getTask(taskId);
    if (Option.isNone(taskOption)) {
      return false;
    }

    const { processed, total } = taskOption.value.units;
    return total !== undefined && processed >= total;
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
                wrapEffects(effects, (effect) => wrapTrackedEffect(progress, handle.id, effect)),
                {
                  concurrency: options.concurrency,
                  discard: options.discard,
                  mode: options.mode,
                },
              ),
              (exit) =>
                Effect.gen(function* () {
                  // Result mode considers fully accounted work complete even after an abnormal exit.
                  if (
                    Exit.isFailure(exit) &&
                    isCollectAllMode(options.mode) &&
                    (yield* isTaskFullyProcessed(progress, handle.id))
                  ) {
                    yield* handle.complete;
                  }
                }),
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
              (item, index) => wrapTrackedEffect(progress, handle.id, f(item, index)),
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
