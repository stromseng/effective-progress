import { Context, Layer } from "effect";

export interface ProgressStdioShape {
  readonly stdout: NodeJS.WriteStream;
  readonly stderr: NodeJS.WriteStream;
}

const defaultStdioService: ProgressStdioShape = {
  stdout: process.stdout,
  stderr: process.stderr,
};

export class ProgressStdio extends Context.Tag("stromseng.dev/effective-progress/ProgressStdio")<
  ProgressStdio,
  ProgressStdioShape
>() {
  static readonly Default = Layer.succeed(ProgressStdio, defaultStdioService);
}
