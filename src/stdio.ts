import { Context, Layer } from "effect";

export interface ProgressStdioService {
  readonly stdout: NodeJS.WriteStream;
  readonly stderr: NodeJS.WriteStream;
}

const defaultStdioService: ProgressStdioService = {
  stdout: process.stdout,
  stderr: process.stderr,
};

export class ProgressStdio extends Context.Tag("stromseng.dev/effective-progress/ProgressStdio")<
  ProgressStdio,
  ProgressStdioService
>() {
  static readonly Default = Layer.succeed(ProgressStdio, defaultStdioService);
}
