import { Console, Effect } from "effect";
import * as Progress from "../src";

const program = Progress.all(
  Array.from({ length: 5 }).map((_, i) =>
    Effect.gen(function* () {
      yield* Effect.sleep("1 second");
      if (i === 2) {
        return yield* Effect.fail(new Error(`Task ${i + 1} failed`));
      }
    }),
  ),
  {
    description: "Running tasks in parallel",
    concurrency: 2,
  },
);

Effect.runPromise(program);
