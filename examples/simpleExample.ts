import { Console, Effect, Logger } from "effect";
import * as Progress from "../src";

const program = Effect.gen(function* () {
  yield* Progress.forEach(["init"], () => Effect.sleep("2 seconds"), {
    description: "Bootstrapping environment",
    total: 0,
  });

  yield* Progress.forEach(
    ["users.csv", "orders.csv", "events.csv", "sessions.csv"],
    (file, index) =>
      Effect.gen(function* () {
        yield* Effect.sleep("900 millis");
        yield* Console.log(`Imported ${file} (${index + 1}/4)`);
        return file;
      }),
    { description: "Importing data files" },
  );

  yield* Progress.all(
    Array.from({ length: 8 }, (_, index) =>
      Effect.gen(function* () {
        yield* Effect.sleep("700 millis");

        yield* Progress.forEach(
          ["fetch", "transform", "persist"],
          (stage) =>
            Effect.gen(function* () {
              yield* Effect.sleep("650 millis");
              yield* Console.log(`Worker ${index + 1}: ${stage}`);
              return stage;
            }),
          { description: `Worker ${index + 1} pipeline` },
        );

        return `worker-${index + 1}`;
      }),
    ),
    {
      description: "Running worker pool",
      all: { concurrency: 3 },
    },
  );

  yield* Progress.forEach(
    [1, 2, 3, 4, 5],
    (step) =>
      Effect.gen(function* () {
        yield* Effect.sleep("1 second");
        yield* Console.log(`Manual deployment (step ${step}/5)`);
        return step;
      }),
    { description: "Manual deployment" },
  );

  yield* Console.log("All advanced progress examples finished.");
});

Effect.runPromise(program.pipe(Effect.provide(Logger.pretty)));
