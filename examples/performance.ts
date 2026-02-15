import { Console, Duration, Effect } from "effect";
import * as Progress from "../src";

const WORKERS = 16;
const BATCHES_PER_WORKER = 8;
const STEPS_PER_BATCH = 200;
const WORKER_CONCURRENCY = 10;
const BATCH_CONCURRENCY = 5;
const BURST_LOG_LINES = 300;

const stepSleep = "1 millis";
const stepMillis = Duration.toMillis(Duration.decode(stepSleep));

const ceilDiv = (value: number, by: number) => Math.ceil(value / by);

const totalSleepCount = WORKERS * BATCHES_PER_WORKER * STEPS_PER_BATCH;
const totalConfiguredSleepMillis = totalSleepCount * stepMillis;
const expectedWorkerMillis =
  ceilDiv(BATCHES_PER_WORKER, BATCH_CONCURRENCY) * STEPS_PER_BATCH * stepMillis;
const expectedWallMillis = ceilDiv(WORKERS, WORKER_CONCURRENCY) * expectedWorkerMillis;

const runWorker = (worker: number) =>
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

const program = Effect.gen(function* () {
  const progress = yield* Progress.Progress;

  // Fill log history early to exercise retention behavior while tasks render.
  yield* progress.withTask(
    Effect.forEach(
      Array.from({ length: BURST_LOG_LINES }, (_, i) => i + 1),
      (line) => Console.log(`warmup log ${line}/${BURST_LOG_LINES}`),
      { discard: true },
    ),
    { description: "Warmup logs", transient: true },
  );

  yield* Progress.all(
    Array.from({ length: WORKERS }, (_, i) => runWorker(i + 1)),
    {
      description: "Performance stress run",
      concurrency: WORKER_CONCURRENCY,
    },
  );

  yield* Console.log("Performance stress example complete.");
});

const configuredProgram = Progress.task(program, {
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

const startedAt = performance.now();
await Effect.runPromise(configuredProgram);
const actualMillis = performance.now() - startedAt;
const overheadMillis = actualMillis - expectedWallMillis;

console.log("\nPerformance timing summary");
console.log(`- total sleep calls: ${totalSleepCount}`);
console.log(`- configured sleep per call: ${stepMillis} ms`);
console.log(
  `- expected total sleep (cumulative): ${(totalConfiguredSleepMillis / 1000).toFixed(2)} s`,
);
console.log(
  `- expected wall time (sleep-only lower bound): ${(expectedWallMillis / 1000).toFixed(3)} s`,
);
console.log(`- actual wall time: ${(actualMillis / 1000).toFixed(3)} s`);
console.log(`- overhead vs sleep-only bound: ${(overheadMillis / 1000).toFixed(3)} s`);
