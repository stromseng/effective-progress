import { Effect, Logger } from "effect";
import * as Progress from "../src";

const randomMillis = (base: number, jitter: number) =>
  Math.max(80, Math.round(base + (Math.random() * 2 - 1) * jitter));

const sleepRandom = (base: number, jitter: number) =>
  Effect.sleep(`${randomMillis(base, jitter)} millis`);

const stages = ["fetch", "transform", "persist"] as const;
const services = ["identity", "catalog"] as const;

const serviceFlow = (service: string, serviceIndex: number) =>
  Effect.gen(function* () {
    yield* Effect.logInfo(`${service}: pipeline started`);

    yield* Progress.task(sleepRandom(1400, 450), {
      description: `${service}: waiting for upstream`,
      transient: true,
    });

    yield* Progress.all(
      Array.from({ length: 3 }, (_, batchIndex) =>
        Effect.gen(function* () {
          const batch = batchIndex + 1;

          yield* Progress.forEach(stages, () => sleepRandom(950, 280), {
            description: `${service}: batch ${batch} stages`,
          });

          yield* Progress.task(
            Effect.gen(function* () {
              yield* sleepRandom(1600, 500);
              if (serviceIndex === 0 && batch === 2) {
                yield* Effect.logWarning("One consistency probe was slower than expected");
              }
            }),
            {
              description: `${service} probe`,
              transient: true,
            },
          );
        }),
      ),
      {
        description: `${service}: processing batches`,
        concurrency: 2,
      },
    );

    yield* Effect.logInfo(`${service}: pipeline finished`);
    yield* Effect.logInfo(`${service}: complete`);
  });

const program = Effect.gen(function* () {
  yield* Effect.logInfo("Showcase: nested concurrent tasks with spinners and mixed logging.");

  yield* Progress.all(
    services.map((service, index) => serviceFlow(service, index)),
    {
      description: "Orchestrating service rollout",
      concurrency: 2,
    },
  );

  yield* Progress.forEach(
    ["publish changelog", "snapshot metrics", "emit webhook"],
    (step, index) =>
      Effect.gen(function* () {
        yield* sleepRandom(1100, 300);
        if (index === 2) {
          yield* Effect.logInfo("Webhook dispatch queued for async confirmation");
          yield* Effect.logInfo(`Post-step complete: ${step}`);
        }
      }),
    {
      description: "Finalization",
      concurrency: 2,
    },
  );
}).pipe(Progress.task({ description: "Showcase program", transient: false }));

Effect.runPromise(program.pipe(Effect.provide(Logger.pretty)));
