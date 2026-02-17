import { Effect } from "effect";
import * as Progress from "../src";

const program = Progress.all(
  Array.from({ length: 5 }).map((_, i) =>
    Effect.asVoid(
      Progress.all(
        Array.from({ length: 15 }).map((_) => Effect.sleep("100 millis")),
        { description: `Running subtasks for task ${i + 1}` },
      ),
    ),
  ),
  { description: "Running tasks in parallel", concurrency: 2, transient: false },
);

Effect.runPromise(
  program.pipe(
    Effect.provideService(Progress.RendererConfig, { determinateTaskLayout: "single-line" }),
  ),
);
