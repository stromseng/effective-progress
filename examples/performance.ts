import { Console, Effect } from "effect";
import * as Progress from "../src";

const WORKERS = 16;
const BATCHES_PER_WORKER = 8;
const STEPS_PER_BATCH = 200;
const WORKER_CONCURRENCY = 10;
const BATCH_CONCURRENCY = 5;
const BURST_LOG_LINES = 300;

const stepSleep = "1 millis";

const runWorkerBare = (worker: number) =>
  Effect.forEach(
    Array.from({ length: BATCHES_PER_WORKER }, (_, i) => i + 1),
    (batch) =>
      Effect.forEach(
        Array.from({ length: STEPS_PER_BATCH }, (_, i) => i + 1),
        (step) =>
          Effect.gen(function* () {
            yield* Effect.sleep(stepSleep);
            if (step % 20 === 0) {
              yield* Console.log(
                `worker-${worker} batch-${batch}: completed step ${step}/${STEPS_PER_BATCH}`,
              );
            }
          }),
        { concurrency: 1, discard: true },
      ),
    { concurrency: BATCH_CONCURRENCY, discard: true },
  ).pipe(Effect.tap(() => Console.log(`worker-${worker}: done`)));

const runWorkerProgress = (worker: number) =>
  Progress.forEach(
    Array.from({ length: BATCHES_PER_WORKER }, (_, i) => i + 1),
    (batch) =>
      Progress.forEach(
        Array.from({ length: STEPS_PER_BATCH }, (_, i) => i + 1),
        (step) =>
          Effect.gen(function* () {
            yield* Effect.sleep(stepSleep);
            if (step % 20 === 0) {
              yield* Console.log(
                `worker-${worker} batch-${batch}: completed step ${step}/${STEPS_PER_BATCH}`,
              );
            }
          }),
        {
          description: `worker-${worker} batch-${batch}`,
        },
      ),
    {
      description: `worker-${worker} batches`,
      concurrency: BATCH_CONCURRENCY,
    },
  ).pipe(Effect.tap(() => Console.log(`worker-${worker}: done`)));

// --- Bare run (no Progress) ---
const bareProgram = Effect.gen(function* () {
  yield* Effect.forEach(
    Array.from({ length: BURST_LOG_LINES }, (_, i) => i + 1),
    (line) => Console.log(`warmup log ${line}/${BURST_LOG_LINES}`),
    { discard: true },
  );

  yield* Effect.forEach(
    Array.from({ length: WORKERS }, (_, i) => i + 1),
    (worker) => runWorkerBare(worker),
    { concurrency: WORKER_CONCURRENCY, discard: true },
  );

  yield* Console.log("Performance stress example complete.");
});

// --- Progress run ---
const progressProgram = Effect.gen(function* () {
  const progress = yield* Progress.Progress;

  yield* progress.withTask(
    Effect.forEach(
      Array.from({ length: BURST_LOG_LINES }, (_, i) => i + 1),
      (line) => Console.log(`warmup log ${line}/${BURST_LOG_LINES}`),
      { discard: true },
    ),
    { description: "Warmup logs", transient: true },
  );

  yield* Progress.all(
    Array.from({ length: WORKERS }, (_, i) => runWorkerProgress(i + 1)),
    {
      description: "Performance stress run",
      concurrency: WORKER_CONCURRENCY,
    },
  );

  yield* Console.log("Performance stress example complete.");
});

const configuredProgressProgram = Progress.task(progressProgram, {
  description: "Performance run",
  transient: false,
}).pipe(
  Effect.provideService(Progress.RendererConfig, {
    maxLogLines: 10,
    renderIntervalMillis: 10,
    nonTtyUpdateStep: 10,
  }),
  Effect.provideService(Progress.ProgressBarConfig, {
    barWidth: 24,
    spinnerFrames: [".", "o", "O", "0"],
  }),
);

// --- Run both and compare ---
console.log("Running bare (no Progress)...\n");
const bareStart = performance.now();
await Effect.runPromise(bareProgram);
const bareMillis = performance.now() - bareStart;

console.log("\nRunning with Progress...\n");
const progressStart = performance.now();
await Effect.runPromise(configuredProgressProgram);
const progressMillis = performance.now() - progressStart;

const overheadMillis = progressMillis - bareMillis;
const overheadPercent = ((overheadMillis / bareMillis) * 100).toFixed(1);

console.log("\nPerformance comparison");
console.log(`- bare (no Progress):  ${(bareMillis / 1000).toFixed(3)} s`);
console.log(`- with Progress:       ${(progressMillis / 1000).toFixed(3)} s`);
console.log(`- overhead:            ${(overheadMillis / 1000).toFixed(3)} s (${overheadPercent}%)`);
