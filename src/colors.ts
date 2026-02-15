import chalk from "chalk";
import { Context, Layer } from "effect";

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
}
