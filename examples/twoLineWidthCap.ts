import { Effect } from "effect";
import * as Progress from "../src";

const veryLongDescription =
  "Deploying a very long task description to demonstrate two-line layout and max width clamping";

const program = Progress.task(
  Progress.forEach(
    Array.from({ length: 3 }, (_, i) => i + 1),
    (batch) =>
      Progress.forEach(
        Array.from({ length: 18 }, (_, i) => i + 1),
        () => Effect.sleep("80 millis"),
        {
          description: `${veryLongDescription} (batch ${batch})`,
        },
      ),
    {
      description: "Coordinating multi-batch rollout with two-line determinate bars",
      concurrency: 2,
    },
  ),
  {
    description: "Two-line + width cap demo",
    transient: false,
  },
).pipe(
  Effect.provideService(Progress.RendererConfig, {
    determinateTaskLayout: "two-lines",
    maxTaskWidth: 100,
    renderIntervalMillis: 60,
  }),
);

Effect.runPromise(program);
