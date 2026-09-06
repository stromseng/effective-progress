import { expect, test } from "bun:test";
import { Effect, Exit } from "effect";
import { Progress } from "../../src/services/progress";
import { Renderer } from "../../src/renderer/renderer";

test.each([false, true])(
  "renderer starts before work and releases on scope exit (failure: %s)",
  async (fail) => {
    const events: string[] = [];
    const start = Effect.acquireRelease(
      Effect.sync(() => {
        events.push("start");
      }),
      () =>
        Effect.sync(() => {
          events.push("release");
        }),
    );
    const exit = await Effect.runPromise(
      Effect.gen(function* () {
        yield* Progress;
        events.push("work");
        if (fail) {
          return yield* Effect.fail("failure");
        }
      }).pipe(
        Effect.provide(Progress.layer),
        Effect.provideService(Renderer, { start }),
        Effect.scoped,
        Effect.exit,
      ),
    );
    expect(events).toEqual(["start", "work", "release"]);
    expect(Exit.isFailure(exit)).toBe(fail);
  },
);
