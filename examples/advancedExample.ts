import { Console, Effect } from "effect";
import * as Progress from "../src";

const advancedProgram = Effect.gen(function* () {
  yield* Progress.withTask(
    Effect.gen(function* () {
      yield* Effect.sleep("2 seconds");
      const currentTask = yield* Progress.Task;
      yield* Console.log("Bootstrapped", { taskId: currentTask });
    }),
    {
      description: "Bootstrapping environment",
    },
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
      Progress.withTask(
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
              progressbar: {
                barWidth: 20,
                spinnerFrames: [".", "o", "O", "0"],
                colors: {
                  fill: { kind: "named", value: "blueBright" },
                  spinner: { kind: "named", value: "magentaBright" },
                },
              },
            },
          );

          return `worker-${index + 1}`;
        }),
        {
          description: `Worker ${index + 1}`,
        },
      ),
    ),
    {
      description: "Running worker pool",
      concurrency: 3,
    },
  );

  const progress = yield* Progress.Progress;

  const deployTask = yield* progress.addTask({
    description: "Manual deployment",
    total: 5,
    transient: true,
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

const configuredProgram = Progress.withTask(advancedProgram, {
  description: "Advanced example",
  transient: false,
}).pipe(
  Effect.provideService(Progress.RendererConfig, {
    nonTtyUpdateStep: 2,
    maxLogLines: 12,
  }),
  Effect.provideService(Progress.ProgressBarConfig, {
    barWidth: 36,
    colors: {
      fill: { kind: "hex", value: "#00b894" },
      empty: { kind: "named", value: "white", modifiers: ["dim"] },
      brackets: { kind: "rgb", value: { r: 180, g: 190, b: 210 } },
      percent: { kind: "named", value: "whiteBright", modifiers: ["bold"] },
      spinner: { kind: "ansi256", value: 214 },
      done: { kind: "named", value: "greenBright" },
      failed: { kind: "named", value: "redBright", modifiers: ["bold"] },
    },
  }),
);

Effect.runPromise(configuredProgram);
