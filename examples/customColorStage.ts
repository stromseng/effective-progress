import { Effect } from "effect";
import * as Progress from "../src";

const PlainTextColorStage: Progress.ColorStageService = {
  colorFrame: ({ frame }) =>
    frame.taskBlocks.flatMap((block) =>
      block.rows.map((row) => {
        const gap = " ".repeat(row.gap);
        return row.cells
          .map((cell) => cell.segments.map((segment) => segment.text).join(""))
          .join(gap)
          .trimEnd();
      }),
    ),
};

const program = Progress.task(
  Progress.all(
    Array.from({ length: 4 }, (_, i) => i + 1).map((worker) =>
      Progress.forEach(
        Array.from({ length: 10 }, (_, i) => i + 1),
        () => Effect.sleep("70 millis"),
        {
          description: `worker-${worker}: processing queue`,
        },
      ),
    ),
    {
      description: "Stage override demo",
      concurrency: 2,
    },
  ),
  { description: "Custom ColorStage (plain output)", transient: false },
).pipe(
  // Remove ANSI styling by replacing only the final color/materialization stage.
  Effect.provideService(Progress.ColorStage, PlainTextColorStage),
);

Effect.runPromise(program);
