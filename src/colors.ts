import chalk, { type ChalkInstance } from "chalk";
import { Context, Effect, Layer } from "effect";

export interface ColorizerService {
  readonly fill: (text: string) => string;
  readonly empty: (text: string) => string;
  readonly brackets: (text: string) => string;
  readonly percent: (text: string) => string;
  readonly spinner: (text: string) => string;
  readonly done: (text: string) => string;
  readonly failed: (text: string) => string;
}

export class Colorizer extends Context.Tag("stromseng.dev/effective-progress/Colorizer")<
  Colorizer,
  ColorizerService
>() {
  static readonly Default = Layer.succeed(
    Colorizer,
    Colorizer.of({
      fill: chalk.blue,
      empty: chalk.white.dim,
      brackets: chalk.white.dim,
      percent: chalk.white.bold,
      spinner: chalk.yellow,
      done: chalk.green,
      failed: chalk.red,
    }),
  );
  static readonly Rainbow = Layer.unwrapEffect(
    Effect.gen(function* () {
      let colorNumber = 17;
      yield* Effect.fork(
        Effect.gen(function* () {
          while (true) {
            colorNumber = (colorNumber + 1) % 256;
            yield* Effect.sleep("200 millis");
          }
        }),
      );
      const secondFunc = (chalk: ChalkInstance) => {
        return (text: string) => chalk.ansi256(colorNumber)(text);
      };

      return Layer.succeed(
        Colorizer,
        Colorizer.of({
          fill: secondFunc(chalk),
          empty: secondFunc(chalk.dim),
          brackets: secondFunc(chalk),
          percent: secondFunc(chalk.bold),
          spinner: secondFunc(chalk),
          done: secondFunc(chalk),
          failed: secondFunc(chalk),
        }),
      );
    }),
  );
}
