import { describe, expect, test } from "bun:test";
import { Console, Effect } from "effect";
import * as Progress from "../src";

const captureTerminalOutput = async <A, E, R>(effect: Effect.Effect<A, E, R>) => {
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  const originalRows = (process.stderr as any).rows;
  let stream = "";

  const captureWrite =
    () =>
    (chunk: unknown, encoding?: BufferEncoding, callback?: (error?: Error | null) => void) => {
      if (typeof chunk === "string") {
        stream += chunk;
      } else if (Buffer.isBuffer(chunk)) {
        stream += chunk.toString(encoding);
      } else {
        stream += String(chunk);
      }

      callback?.(null);
      return true;
    };

  (process.stdout as any).write = captureWrite();
  (process.stderr as any).write = captureWrite();
  (process.stderr as any).rows = 200;

  try {
    const result = await Effect.runPromise(effect as Effect.Effect<A, E, never>);
    return { result, stream };
  } finally {
    (process.stdout as any).write = originalStdoutWrite;
    (process.stderr as any).write = originalStderrWrite;
    if (originalRows === undefined) {
      delete (process.stderr as any).rows;
    } else {
      (process.stderr as any).rows = originalRows;
    }
  }
};

const renderFinalScreen = (stream: string): Array<string> => {
  const lines: Array<string> = [""];
  let row = 0;
  let col = 0;

  const ensureRow = (nextRow: number) => {
    while (lines.length <= nextRow) {
      lines.push("");
    }
  };

  for (let i = 0; i < stream.length; i++) {
    const ch = stream[i]!;

    if (ch === "\x1b" && stream[i + 1] === "[") {
      let j = i + 2;
      while (j < stream.length && !/[A-Za-z]/.test(stream[j]!)) {
        j += 1;
      }
      if (j >= stream.length) {
        break;
      }

      const sequence = stream.slice(i + 2, j + 1);
      if (sequence === "2K") {
        ensureRow(row);
        lines[row] = "";
        col = 0;
      } else if (sequence === "1A") {
        row = Math.max(0, row - 1);
      }

      i = j;
      continue;
    }

    if (ch === "\r") {
      col = 0;
      continue;
    }

    if (ch === "\n") {
      row += 1;
      col = 0;
      ensureRow(row);
      continue;
    }

    if (ch === "\b") {
      col = Math.max(0, col - 1);
      continue;
    }

    ensureRow(row);
    const line = lines[row]!;
    if (col >= line.length) {
      lines[row] = line + ch;
    } else {
      lines[row] = line.slice(0, col) + ch + line.slice(col + 1);
    }
    col += 1;
  }

  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines.map((line) => line.trimEnd());
};

describe("TTY renderer integration", () => {
  test("preserves plain interstitial logs and renders final done frame", async () => {
    const program = Progress.provide(
      Effect.gen(function* () {
        const progress = yield* Progress.Progress;

        yield* progress.withCapturedLogs(
          Effect.forEach(
            Array.from({ length: 20 }, (_, i) => i + 1),
            (line) => Console.log(`warmup-${line}`),
            { discard: true },
          ),
        );

        yield* Progress.all([Effect.sleep("10 millis")], {
          description: "First task",
        });

        yield* Effect.sync(() => {
          process.stderr.write("between-log\n");
        });

        yield* Progress.all([Effect.sleep("10 millis")], {
          description: "Second task",
        });
      }),
    ).pipe(
      Effect.provideService(Progress.RendererConfig, {
        isTTY: true,
        maxLogLines: 10,
        renderIntervalMillis: 5,
        nonTtyUpdateStep: 1,
        disableUserInput: false,
      }),
    );

    const { stream } = await captureTerminalOutput(program);
    const finalScreen = renderFinalScreen(stream);

    expect(finalScreen.some((line) => line.includes("warmup-18"))).toBeTrue();
    expect(finalScreen.some((line) => line.includes("warmup-19"))).toBeTrue();
    expect(finalScreen.some((line) => line.includes("warmup-20"))).toBeTrue();
    expect(finalScreen.some((line) => line.includes("between-log"))).toBeTrue();
    expect(finalScreen.some((line) => line.includes("[done]"))).toBeTrue();
  });

  test("enforces max log history in retained TTY mode", async () => {
    const program = Progress.provide(
      Effect.gen(function* () {
        const progress = yield* Progress.Progress;

        yield* progress.withCapturedLogs(
          Effect.forEach(
            Array.from({ length: 20 }, (_, i) => i + 1),
            (line) => Console.log(`warmup-${line}`),
            { discard: true },
          ),
        );

        yield* Progress.all([Effect.sleep("10 millis")], {
          description: "History task",
        });
      }),
    ).pipe(
      Effect.provideService(Progress.RendererConfig, {
        isTTY: true,
        maxLogLines: 3,
        renderIntervalMillis: 5,
        nonTtyUpdateStep: 1,
        disableUserInput: false,
      }),
    );

    const { stream } = await captureTerminalOutput(program);
    const finalScreen = renderFinalScreen(stream);
    const hasWarmupLine = (lineNumber: number) =>
      finalScreen.some((line) => line.trim() === `warmup-${lineNumber}`);

    expect(hasWarmupLine(18)).toBeTrue();
    expect(hasWarmupLine(19)).toBeTrue();
    expect(hasWarmupLine(20)).toBeTrue();
    expect(hasWarmupLine(1)).toBeFalse();
    expect(hasWarmupLine(2)).toBeFalse();
    expect(hasWarmupLine(3)).toBeFalse();
  });
});
