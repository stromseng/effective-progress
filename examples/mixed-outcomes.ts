import { Effect } from "effect";
import * as Progress from "../src";

const makeMixedEffects = () => [
  Effect.sleep("1 second").pipe(Effect.as("alpha")),
  Effect.sleep("1.2 seconds").pipe(Effect.as("beta")),
  Effect.sleep("900 millis").pipe(Effect.andThen(Effect.fail("boom"))),
  Effect.sleep("1.1 seconds").pipe(Effect.as("gamma")),
];

const makeSuccessEffects = () => [
  Effect.sleep("900 millis").pipe(Effect.as("one")),
  Effect.sleep("1.1 seconds").pipe(Effect.as("two")),
  Effect.sleep("1 second").pipe(Effect.as("three")),
];

const makeAllFailedEffects = () => [
  Effect.sleep("700 millis").pipe(Effect.andThen(Effect.fail("err-1"))),
  Effect.sleep("900 millis").pipe(Effect.andThen(Effect.fail("err-2"))),
  Effect.sleep("1 second").pipe(Effect.andThen(Effect.fail("err-3"))),
];

const program = Effect.gen(function* () {
  yield* Effect.exit(
    Progress.all(makeMixedEffects(), {
      description: "default mode (fail-fast)",
      mode: "default",
      concurrency: 2,
    }),
  );

  yield* Progress.all(makeMixedEffects(), {
    description: "result mode (collect all outcomes)",
    mode: "result",
    concurrency: 2,
  });

  yield* Progress.all(makeSuccessEffects(), {
    description: "result mode (all succeeded)",
    mode: "result",
    concurrency: 2,
  });

  yield* Progress.all(makeAllFailedEffects(), {
    description: "result mode (all failed)",
    mode: "result",
    concurrency: 2,
  });

  const progress = yield* Progress.Progress;
  const taskId = yield* progress.addTask({
    description: "manual mixed counters",
    total: 10,
    transient: false,
  });

  for (let i = 0; i < 5; i++) {
    yield* Effect.sleep("500 millis");
    yield* progress.incrementSucceeded(taskId, 1);
  }

  yield* Effect.sleep("700 millis");
  yield* progress.incrementFailed(taskId, 1);
  yield* Effect.sleep("700 millis");
  yield* progress.incrementFailed(taskId, 1);
  yield* Effect.sleep("500 millis");
  yield* progress.completeTask(taskId);
}).pipe(Progress.task({ description: "Mixed outcomes showcase", transient: false }));

Effect.runPromise(program);
