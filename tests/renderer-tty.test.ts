import { describe, expect, test } from "bun:test";
import { Console, Effect } from "effect";
import * as Progress from "../src";

const captureTerminalOutput = async <A, E, R>(effect: Effect.Effect<A, E, R>) => {
  let stream = "";

  const terminal: Progress.ProgressTerminalService = {
    isTTY: Effect.succeed(true),
    stderrRows: Effect.succeed(200),
    stderrColumns: Effect.succeed(160),
    writeStderr: (text) =>
      Effect.sync(() => {
        stream += text;
      }),
    withRawInputCapture: (innerEffect) => innerEffect,
  };

  const result = await Effect.runPromise(
    effect.pipe(Effect.provideService(Progress.ProgressTerminal, terminal)) as Effect.Effect<
      A,
      E,
      never
    >,
  );
  return { result, stream };
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
    const program = Progress.withTask(
      Effect.gen(function* () {
        yield* Progress.withTask(
          Effect.forEach(
            Array.from({ length: 20 }, (_, i) => i + 1),
            (line) => Console.log(`warmup-${line}`),
            { discard: true },
          ),
          { description: "Warmup logs", transient: true },
        );

        yield* Progress.all([Effect.sleep("10 millis")], {
          description: "First task",
          transient: false,
        });

        const terminal = yield* Progress.ProgressTerminal;
        yield* terminal.writeStderr("between-log\n");

        yield* Progress.all([Effect.sleep("10 millis")], {
          description: "Second task",
          transient: false,
        });
      }),
      { description: "tty-session", transient: false },
    ).pipe(
      Effect.provideService(Progress.RendererConfig, {
        maxLogLines: 10,
        renderIntervalMillis: 5,
        nonTtyUpdateStep: 1,
        disableUserInput: false,
      }),
    );

    const { stream } = await captureTerminalOutput(program);
    const finalScreen = renderFinalScreen(stream);

    expect(stream.split("\x1b[?25l").length - 1).toBe(1);
    expect(stream.split("\x1b[?25h").length - 1).toBe(1);
    expect(finalScreen.some((line) => line.includes("warmup-18"))).toBeTrue();
    expect(finalScreen.some((line) => line.includes("warmup-19"))).toBeTrue();
    expect(finalScreen.some((line) => line.includes("warmup-20"))).toBeTrue();
    expect(stream.includes("between-log")).toBeTrue();
    expect(finalScreen.some((line) => line.includes("First task"))).toBeTrue();
    expect(finalScreen.some((line) => line.includes("Second task"))).toBeTrue();
    expect(finalScreen.some((line) => line.includes("[done]"))).toBeTrue();
  });

  test("enforces max log history in retained TTY mode", async () => {
    const program = Progress.withTask(
      Effect.gen(function* () {
        yield* Progress.withTask(
          Effect.forEach(
            Array.from({ length: 20 }, (_, i) => i + 1),
            (line) => Console.log(`warmup-${line}`),
            { discard: true },
          ),
          { description: "Warmup logs", transient: true },
        );

        yield* Progress.all([Effect.sleep("10 millis")], {
          description: "History task",
          transient: false,
        });
      }),
      { description: "tty-session", transient: false },
    ).pipe(
      Effect.provideService(Progress.RendererConfig, {
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
