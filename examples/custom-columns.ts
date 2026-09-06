import { Data, Effect, Logger, Random } from "effect";
import * as Progress from "../src";

const sleepRandom = (base: number, jitter: number) =>
  Effect.flatMap(Random.nextBetween(-jitter, jitter), (offset) =>
    Effect.sleep(`${Math.max(80, Math.round(base + offset))} millis`),
  );

// --- Typed metadata example ---
// Each model evaluation task carries structured metadata that gets
// rendered into custom columns aligned across all tasks.

const models = ["Qwen-2.5-72B", "Llama-3.3-70B", "Mistral-Large-2"] as const;
const scripts = ["eval_mcq", "eval_rag", "eval_code"] as const;

class EvalError extends Data.TaggedError("EvalError")<{
  readonly message: string;
}> {}

const runEval = (model: string, script: string) =>
  Effect.gen(function* () {
    yield* sleepRandom(1200, 400);
    const score = Math.round(yield* Random.nextBetween(60, 100));
    const passed = (yield* Random.next) > 0.15;
    if (!passed) {
      return yield* new EvalError({ message: `${model}/${script} failed` });
    }
    return { model, script, score };
  });

const evaluateModel = (model: string) =>
  Progress.task(
    (task) =>
      Effect.gen(function* () {
        for (let i = 0; i < scripts.length; i++) {
          const script = scripts[i]!;
          const exit = yield* Effect.exit(runEval(model, script));

          if (exit._tag === "Success") {
            yield* task.incrementSucceeded();
            yield* task.setMetadata(exit.value);
          } else {
            yield* task.incrementFailed();
            yield* task.setMetadata({
              model,
              script,
              score: 0,
            });
          }

          yield* task.update({
            description: `[eval] ${model} (${i + 1}/${scripts.length})`,
          });
        }
      }),
    {
      description: `[eval] ${model}`,
      total: scripts.length,
      metadata: {
        model: "",
        script: "",
        score: 0,
      },
      columns: [
        Progress.Columns.description(),
        Progress.Columns.bar(),
        {
          flexShrink: 0,
          minWidth: 12,
          render: ({ task }) => task.metadata.model,
        },
        {
          flexShrink: 0,
          minWidth: 12,
          render: ({ task }) => task.metadata.script,
        },
        {
          align: "right",
          flexShrink: 0,
          minWidth: 5,
          render: ({ task }) => (task.metadata.score > 0 ? `${task.metadata.score}%` : "—"),
        },
        Progress.Columns.elapsed(),
      ],
    },
  );

const program = Effect.gen(function* () {
  yield* Effect.logInfo("Starting model evaluation suite");

  // Run all model evaluations concurrently — custom columns align across tasks
  yield* Progress.all(
    models.map((model) => evaluateModel(model)),
    {
      description: "Model evaluation suite",
      concurrency: 3,
    },
  );

  // A regular task without metadata — existing API unchanged
  yield* Progress.task(sleepRandom(800, 200), {
    description: "Publishing results",
    transient: true,
  });

  yield* Effect.logInfo("Evaluation complete");
});

Effect.runPromise(program.pipe(Effect.provide(Logger.layer([Logger.consolePretty()]))));
