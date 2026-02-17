import chalk from "chalk";
import { Effect } from "effect";
import * as Progress from "../src";

const depthColors = [
  chalk.cyanBright,
  chalk.greenBright,
  chalk.yellowBright,
  chalk.magentaBright,
] as const;

const nestedProgram = Progress.task(
  Progress.all(
    ["ingest", "transform", "publish"].map((pipelineName) =>
      Progress.forEach(
        Array.from({ length: 5 }, (_, i) => i + 1),
        (step) =>
          Effect.gen(function* () {
            yield* Effect.sleep("220 millis");
            if (step === 3) {
              yield* Effect.logInfo(`${pipelineName}: midpoint reached`);
            }
          }),
        {
          description: `${pipelineName}: step execution`,
        },
      ),
    ),
    {
      description: "Running nested pipelines",
      concurrency: 2,
    },
  ),
  { description: "Depth palette demo", transient: false },
).pipe(
  Effect.provideService(
    Progress.Theme,
    Progress.Theme.of({
      styles: {
        plain: (text) => text,
        barFill: chalk.blueBright,
        barEmpty: chalk.gray,
        barBracket: chalk.gray,
        spinner: chalk.yellow,
        statusDone: chalk.green,
        statusFailed: chalk.redBright,
        text: chalk.white,
        units: chalk.whiteBright,
        eta: chalk.gray,
        elapsed: chalk.gray,
        treeConnector: chalk.gray,
      },
      depthPalette: (depth, role) => {
        if (role !== "text" && role !== "treeConnector") {
          return undefined;
        }

        return depthColors[depth % depthColors.length] ?? chalk.white;
      },
    }),
  ),
);

Effect.runPromise(nestedProgram);
