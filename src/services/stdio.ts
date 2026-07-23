import { Context, Layer } from "effect";

export interface ProgressStdioShape {
  readonly stdout: NodeJS.WriteStream;
  readonly stderr: NodeJS.WriteStream;
}

const defaultStdioService: ProgressStdioShape = {
  stdout: process.stdout,
  stderr: process.stderr,
};

export class ProgressStdio extends Context.Service<ProgressStdio, ProgressStdioShape>()(
  "stromseng.dev/effective-progress/ProgressStdio",
) {
  static readonly layer = Layer.succeed(ProgressStdio, defaultStdioService);
}
