import { PassThrough, type Writable } from "node:stream";
import type { ProgressStdioService } from "../../src/services/stdio";

interface MockWriteStreamOptions {
  readonly isTTY: boolean;
  readonly columns?: number;
  readonly rows?: number;
}

interface MockWriteStreamHandle {
  readonly stream: NodeJS.WriteStream;
  readonly getOutput: () => string;
  readonly clear: () => void;
}

interface MockStdioOptions {
  readonly stdout?: MockWriteStreamOptions;
  readonly stderr?: MockWriteStreamOptions;
}

export interface MockStdioHandle {
  readonly service: ProgressStdioService;
  readonly stdout: MockWriteStreamHandle;
  readonly stderr: MockWriteStreamHandle;
}

const createMockWriteStream = (options: MockWriteStreamOptions): MockWriteStreamHandle => {
  const stream = new PassThrough();
  let output = "";
  const columns = options.columns ?? 0;
  const rows = options.rows ?? 0;

  stream.setEncoding("utf8");
  stream.on("data", (chunk: string) => {
    output += chunk;
  });

  const writeStream: Writable = Object.assign(stream, {
    isTTY: options.isTTY,
    columns,
    rows,
    getWindowSize: (): [number, number] => [columns, rows],
  });

  return {
    // SAFETY: The Writable has the TTY fields assigned above; Ink only uses that surface.
    stream: writeStream as NodeJS.WriteStream,
    getOutput: () => output,
    clear: () => {
      output = "";
    },
  };
};

export const createMockStdio = (options: MockStdioOptions = {}): MockStdioHandle => {
  const stdout = createMockWriteStream(options.stdout ?? { isTTY: false, columns: 0, rows: 0 });
  const stderr = createMockWriteStream(options.stderr ?? { isTTY: false, columns: 0, rows: 0 });

  return {
    service: {
      stdout: stdout.stream,
      stderr: stderr.stream,
    },
    stdout,
    stderr,
  };
};
