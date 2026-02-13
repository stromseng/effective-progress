import { Console, Effect } from "effect";
import { track, trackProgress } from "../progressService";

const program = Effect.gen(function* () {
  yield* track(["init"], { description: "Bootstrapping environment", total: 0 }, () =>
    Effect.sleep("2 seconds"),
  );

  yield* track(
    ["users.csv", "orders.csv", "events.csv", "sessions.csv"],
    { description: "Importing data files" },
    (file, index) =>
      Effect.gen(function* () {
        yield* Effect.sleep("900 millis");
        yield* Console.log(`Imported ${file} (${index + 1}/4)`);
        return file;
      }),
  );

  yield* trackProgress(
    Array.from({ length: 8 }, (_, index) =>
      Effect.gen(function* () {
        yield* Effect.sleep("700 millis");

        yield* track(
          ["fetch", "transform", "persist"],
          { description: `Worker ${index + 1} pipeline` },
          (stage) =>
            Effect.gen(function* () {
              yield* Effect.sleep("650 millis");
              yield* Console.log(`Worker ${index + 1}: ${stage}`);
              return stage;
            }),
        );

        return `worker-${index + 1}`;
      }),
    ),
    {
      description: "Running worker pool",
      all: { concurrency: 3 },
    },
  );

  yield* track([1, 2, 3, 4, 5], { description: "Manual deployment" }, (step) =>
    Effect.gen(function* () {
      yield* Effect.sleep("1 second");
      yield* Console.log(`Manual deployment (step ${step}/5)`);
      return step;
    }),
  );

  yield* Console.log("All advanced progress examples finished.");
});

Effect.runPromise(program);
