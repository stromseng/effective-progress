import { Console, Effect } from "effect";
import * as Progress from "../src";

const WORKERS = 16;
const BATCHES_PER_WORKER = 8;
const STEPS_PER_BATCH = 2000;
const WORKER_CONCURRENCY = 10;
const BATCH_CONCURRENCY = 5;
const BURST_LOG_LINES = 3000;

const stepSleep = "1 millis";

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
      description: "Long performance stress run",
      concurrency: WORKER_CONCURRENCY,
    },
  );

  yield* Console.log("Long performance stress example complete.");
});

const progressRun = Progress.task(progressProgram, {
  description: "Long performance run",
  transient: false,
});

await Effect.runPromise(progressRun);
