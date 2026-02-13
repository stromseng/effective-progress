import { Console, Effect } from "effect";
import { track } from "../src";

const program = track(
  Array.from({ length: 100 }, (_, i) => i + 1),
  { description: "Processing items" },
  () =>
    Effect.gen(function* () {
      yield* Effect.sleep("100 millis");
      yield* Console.log("Processed an item");
    }),
);

Effect.runPromise(program);
