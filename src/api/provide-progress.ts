import { Effect, Option } from "effect";
import { Progress } from "../services/progress";

/** Reuses the caller's service or scopes a new one around the entire operation. */
export const provideProgress = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const existing = yield* Effect.serviceOption(Progress);
    if (Option.isSome(existing)) {
      return yield* Effect.provideService(effect, Progress, existing.value);
    }
    return yield* Effect.scoped(Effect.provide(effect, Progress.layer, { local: true }));
  });
