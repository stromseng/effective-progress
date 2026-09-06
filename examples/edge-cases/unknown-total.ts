import { Effect } from "effect";
import * as Progress from "../../src";

const wait = (millis: number) => Effect.sleep(`${millis} millis`);

const program = Effect.gen(function* () {
  const progress = yield* Progress.Progress;

  const failFastLikeId = yield* progress.addTask({
    description: "stream import (fail-fast style)",
    countDisplay: "processedOnly",
    transient: false,
  });

  yield* wait(500);
  yield* progress.incrementSucceeded(failFastLikeId, 2);
  yield* wait(500);
  yield* progress.incrementFailed(failFastLikeId, 1);
  yield* wait(500);
  yield* progress.failTask(failFastLikeId);

  const collectAllId = yield* progress.addTask({
    description: "stream reconciliation (collect all outcomes)",
    countDisplay: "detailed",
    transient: false,
  });

  yield* wait(500);
  yield* progress.incrementSucceeded(collectAllId, 3);
  yield* wait(500);
  yield* progress.incrementFailed(collectAllId, 1);
  yield* wait(500);
  yield* progress.completeTask(collectAllId);
}).pipe(Progress.task({ description: "Unknown total counting", transient: false }));

Effect.runPromise(program);
