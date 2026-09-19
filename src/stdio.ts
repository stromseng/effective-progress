import { Context, Layer } from "effect";

export interface ProgressStdioService {
  readonly stdout: NodeJS.WriteStream;
  readonly stderr: NodeJS.WriteStream;
}

const defaultStdioService: ProgressStdioService = {
  stdout: process.stdout,
  stderr: process.stderr,
};

export class ProgressStdio extends Context.Service<ProgressStdio, ProgressStdioService>()(
  "stromseng.dev/effective-progress/ProgressStdio",
) {
  static readonly layer = Layer.succeed(ProgressStdio, defaultStdioService);
}
