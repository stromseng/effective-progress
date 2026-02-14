import { Console, Effect } from "effect";
import * as Progress from "../src";

const advancedProgram = Effect.gen(function* () {
  const progress = yield* Progress.Progress;

  yield* progress.withTask(
    {
      description: "Bootstrapping environment",
    },
    () => Effect.sleep("2 seconds"),
  );

  yield* Progress.forEach(
    ["users.csv", "orders.csv", "events.csv", "sessions.csv"],
    (file, index) =>
      Effect.gen(function* () {
        yield* Effect.sleep("900 millis");
        yield* Console.log(`Imported ${file} (${index + 1}/4)`);
        return file;
      }),
    {
      description: "Importing data files",
    },
  );

  yield* Progress.all(
    Array.from({ length: 8 }, (_, index) =>
      progress.withTask(
        {
          description: `Worker ${index + 1}`,
        },
        () =>
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
              {
                description: `Worker ${index + 1} pipeline`,
              },
            );

            return `worker-${index + 1}`;
          }),
      ),
    ),
    {
      description: "Running worker pool",
      concurrency: 3,
    },
  );

  const deployTask = yield* progress.addTask({
    description: "Manual deployment",
    total: 5,
  });

  for (let step = 1; step <= 5; step++) {
    yield* Effect.sleep("1 second");
    yield* progress.updateTask(deployTask, {
      description: `Manual deployment (step ${step}/5)`,
    });
    yield* progress.advanceTask(deployTask, 1);
  }

  yield* progress.completeTask(deployTask);
  yield* Console.log("All advanced progress examples finished.");
});

const configuredProgram = Effect.provideService(advancedProgram, Progress.ProgressConfig, {
  ...Progress.defaultProgressConfig,
  renderer: {
    ...Progress.defaultProgressConfig.renderer,
    nonTtyUpdateStep: 2,
    maxLogLines: 12,
  },
  progressbar: {
    ...Progress.defaultProgressConfig.progressbar,
    barWidth: 36,
  },
});

Effect.runPromise(Progress.withProgressService(configuredProgram));
