import { Console, Effect } from "effect";
import * as Progress from "../src";

const wait = (millis: number) => Effect.sleep(`${millis} millis`);

const showcaseProgram = Effect.gen(function* () {
  const progress = yield* Progress.Progress;

  const zeroTotalId = yield* progress.addTask({
    description: "zero total (renders as 0/0 with a full bar)",
    total: 0,
    transient: false,
    countDisplay: "processedOnly",
  });
  yield* wait(500);
  yield* progress.completeTask(zeroTotalId);

  const negativeOnAddId = yield* progress.addTask({
    description: "negative total on add (falls back to 100)",
    total: -5,
    transient: false,
    countDisplay: "processedOnly",
  });
  yield* wait(500);
  yield* progress.incrementSucceeded(negativeOnAddId, 12);
  yield* wait(500);
  yield* progress.completeTask(negativeOnAddId);

  const negativeOnUpdateId = yield* progress.addTask({
    description: "negative total on update (ignored)",
    total: 5,
    transient: false,
    countDisplay: "processedOnly",
  });
  yield* wait(500);
  yield* progress.updateTask(negativeOnUpdateId, { total: -10 });
  yield* progress.incrementSucceeded(negativeOnUpdateId, 3);
  yield* wait(500);
  yield* progress.completeTask(negativeOnUpdateId);

  const overflowId = yield* progress.addTask({
    description: "overflow counts (raw 8/5, visually full bar)",
    total: 5,
    transient: false,
    countDisplay: "detailed",
  });
  yield* wait(500);
  yield* progress.incrementSucceeded(overflowId, 6);
  yield* wait(500);
  yield* progress.incrementFailed(overflowId, 2);
  yield* wait(500);
  yield* progress.completeTask(overflowId);

  const emptyAll = yield* Progress.all([], {
    description: "empty Progress.all (valid 0/0 task)",
    transient: false,
  });
  yield* Console.log("empty all result", emptyAll);

  const emptyForEach = yield* Progress.forEach([], (item) => Effect.succeed(item), {
    description: "empty Progress.forEach (valid 0/0 task)",
    transient: false,
  });
  yield* Console.log("empty forEach result", emptyForEach);
});

const program = Progress.task(showcaseProgram, {
  description: "cli-progress semantics showcase",
  transient: false,
});

Effect.runPromise(program);
