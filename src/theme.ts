import chalk, { type ChalkInstance } from "chalk";
import { Context, Effect, Layer } from "effect";

export type ThemeRole =
  | "plain"
  | "barFill"
  | "barEmpty"
  | "barBracket"
  | "spinner"
  | "statusDone"
  | "statusFailed"
  | "text"
  | "units"
  | "eta"
  | "elapsed"
  | "treeConnector";

export type ThemeStyle = (text: string) => string;

export interface ThemeService {
  readonly styles: Readonly<Record<ThemeRole, ThemeStyle>>;
  readonly depthPalette?: (depth: number, role: ThemeRole) => ThemeStyle | undefined;
}

export class Theme extends Context.Tag("stromseng.dev/effective-progress/Theme")<
  Theme,
  ThemeService
>() {
  static readonly Default = Layer.succeed(
    Theme,
    Theme.of({
      styles: {
        plain: (text) => text,
        barFill: chalk.blue,
        barEmpty: chalk.white.dim,
        barBracket: chalk.white.dim,
        spinner: chalk.yellow,
        statusDone: chalk.green,
        statusFailed: chalk.red,
        text: (text) => text,
        units: chalk.whiteBright,
        eta: chalk.gray,
        elapsed: chalk.gray,
        treeConnector: chalk.gray,
      },
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

      const dynamic =
        (instance: ChalkInstance): ThemeStyle =>
        (text) =>
          instance.ansi256(colorNumber)(text);

      return Layer.succeed(
        Theme,
        Theme.of({
          styles: {
            plain: (text) => text,
            barFill: dynamic(chalk),
            barEmpty: dynamic(chalk.dim),
            barBracket: dynamic(chalk),
            spinner: dynamic(chalk),
            statusDone: dynamic(chalk.bold),
            statusFailed: dynamic(chalk.bold),
            text: dynamic(chalk),
            units: dynamic(chalk),
            eta: dynamic(chalk),
            elapsed: dynamic(chalk),
            treeConnector: dynamic(chalk),
          },
        }),
      );
    }),
  );
}
