import { Console, Effect } from "effect";
import { trackProgress } from "./progressService";

const program = Effect.gen(function* () {
  const workItems = Array.from({ length: 100 }, (_, i) => i + 1);

  const _results = yield* trackProgress(
    workItems.map((item) =>
      Effect.gen(function* () {
        yield* Effect.sleep("100  millis");
        if (item % 20 === 0) {
          yield* trackProgress(
            ["A", "B", "C", "D"].map((letter) =>
              Effect.gen(function* () {
                yield* Effect.sleep("100 millis");
                yield* Console.log("nested stage", item, letter);
                return `${item}-${letter}`;
              }),
            ),
            {
              description: `Nested ${item}`,
            },
          );
        }

        return item;
      }),
    ),
    {
      description: "Processing work items",
    },
  );
});

Effect.runPromise(program);
