import { Console, Effect, Exit } from "effect";
import { Progress, withProgressService } from "./progressService";

type AllOptions = Parameters<typeof Effect.all>[1];

const trackProgress = <A, E, R, Options extends AllOptions>(
  effectsIterable: Array<Effect.Effect<A, E, R>>,
  options?: Options,
) => {
  return withProgressService(
    Effect.gen(function* () {
      const progress = yield* Progress;
      return yield* progress.withTask(
        {
          description: "Processing work items",
          total: effectsIterable.length,
        },
        (taskId) => {
          const tasks = effectsIterable.map((effect) =>
            Effect.tap(effect, () => progress.advanceTask(taskId, 1)),
          );

          return Effect.gen(function* () {
            const exit = yield* Effect.exit(Effect.all(tasks, options));
            return yield* Exit.match(exit, {
              onFailure: Effect.failCause,
              onSuccess: Effect.succeed,
            });
          });
        },
      );
    }),
  );
};

const program = Effect.gen(function* () {
  const workItems = Array.from({ length: 100 }, (_, i) => i + 1);

  const _results = yield* trackProgress(
    workItems.map((item) =>
      Effect.gen(function* () {
        yield* Effect.sleep("100  millis");
        if (item % 20 === 0) {
          yield* trackProgress(
            ["A", "B", "C", "D"].map((letter) =>
              Effect.gen(function* () {
                yield* Effect.sleep("100 millis");
                yield* Console.log("nested stage", item, letter);
                return `${item}-${letter}`;
              }),
            ),
          );
        }

        return item;
      }),
    ),
  );
});

Effect.runPromise(program);
