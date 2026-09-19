import { Effect } from "effect";
import { Progress } from "../../src/progress";
import { ProgressStdio } from "../../src/stdio";
import { Renderer } from "../../src/renderer/renderer";
import { createMockStdio } from "./mock-stdio";

/** Provides a Progress service whose renderer never mounts Ink. Use for store and task behavior. */
export const withProgress = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.provide(Progress.layer),
    Effect.provideService(Renderer, { start: Effect.void }),
    Effect.scoped,
  );

/** Provides mock stdio streams so the real Ink renderer can mount without touching the terminal. */
export const withMockStdio = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.provideService(effect, ProgressStdio, createMockStdio().service);

/** Runs an effect against a silent Progress service and returns its result. */
export const runProgress = <A, E, R>(effect: Effect.Effect<A, E, R>): Promise<A> =>
  // SAFETY: withProgress supplies Progress, Renderer, and Scope; tests only require those.
  Effect.runPromise(withProgress(effect) as Effect.Effect<A, E>);
