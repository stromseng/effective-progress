import { Console, Effect } from "effect";
import * as Progress from "../src";

const program = Progress.all(
  Array.from({ length: 5 }).map((_, i) =>
    Effect.gen(function* () {
      yield* Effect.sleep("1 second");
      yield* Console.log(`Completed task ${i + 1}`);
    }),
  ),
  { description: "Running tasks in parallel", all: { concurrency: 2 } },
);

Effect.runPromise(program);
