import { describe, expect, test } from "bun:test";
import { Console, Effect, Fiber } from "effect";
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
    const program = Progress.task(
      Effect.gen(function* () {
        yield* Progress.task(
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
    expect(finalScreen.some((line) => line.includes("done"))).toBeTrue();
  });

  test("enforces max log history in retained TTY mode", async () => {
    const program = Progress.task(
      Effect.gen(function* () {
        yield* Progress.task(
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

  test("draws continuation connectors for multiline nodes with children", async () => {
    const program = Effect.gen(function* () {
      const fiber = yield* Effect.fork(
        Progress.task(
          Effect.gen(function* () {
            const progress = yield* Progress.Progress;
            const parentId = yield* progress.addTask({
              description: "parent",
              total: 100,
              transient: false,
            });
            yield* progress.addTask({
              description: "child-1",
              parentId,
              total: 100,
              transient: false,
            });
            yield* progress.addTask({
              description: "child-2",
              parentId,
              total: 100,
              transient: false,
            });

            while (true) {
              yield* Effect.sleep("5 millis");
              yield* progress.advanceTask(parentId, 1);
            }
          }),
          { description: "root", transient: false },
        ).pipe(
          Effect.provideService(Progress.RendererConfig, {
            maxLogLines: 0,
            renderIntervalMillis: 5,
            nonTtyUpdateStep: 1,
            disableUserInput: false,
            determinateTaskLayout: "two-lines",
          }),
        ),
      );

      yield* Effect.sleep("40 millis");
      yield* Fiber.interrupt(fiber);
    });

    const { stream } = await captureTerminalOutput(program);
    const finalScreen = renderFinalScreen(stream);
    const parentLineIndex = finalScreen.findIndex((line) => line.includes("parent"));
    const childLineIndex = finalScreen.findIndex((line) => line.includes("child-1"));

    expect(parentLineIndex).toBeGreaterThanOrEqual(0);
    expect(childLineIndex).toBeGreaterThan(parentLineIndex);

    const continuationLine = finalScreen[parentLineIndex + 1] ?? "";
    const childLine = finalScreen[childLineIndex] ?? "";
    const continuationConnectorIndex = continuationLine.indexOf("│");
    const childBranchIndex = childLine.indexOf("├");

    expect(continuationConnectorIndex).toBeGreaterThanOrEqual(0);
    expect(childBranchIndex).toBeGreaterThanOrEqual(0);
    expect(continuationConnectorIndex).toBe(childBranchIndex);
  });

  test("does not draw dangling continuation connectors for multiline leaf nodes", async () => {
    const program = Effect.gen(function* () {
      const fiber = yield* Effect.fork(
        Progress.task(
          Effect.gen(function* () {
            const progress = yield* Progress.Progress;
            const leafId = yield* progress.addTask({
              description: "leaf",
              total: 100,
              transient: false,
            });

            while (true) {
              yield* Effect.sleep("5 millis");
              yield* progress.advanceTask(leafId, 1);
            }
          }),
          { description: "root", transient: false },
        ).pipe(
          Effect.provideService(Progress.RendererConfig, {
            maxLogLines: 0,
            renderIntervalMillis: 5,
            nonTtyUpdateStep: 1,
            disableUserInput: false,
            determinateTaskLayout: "two-lines",
          }),
        ),
      );

      yield* Effect.sleep("40 millis");
      yield* Fiber.interrupt(fiber);
    });

    const { stream } = await captureTerminalOutput(program);
    const finalScreen = renderFinalScreen(stream);
    const leafLineIndex = finalScreen.findIndex((line) => line.includes("leaf"));

    expect(leafLineIndex).toBeGreaterThanOrEqual(0);
    expect(finalScreen[leafLineIndex + 1]?.includes("│") ?? false).toBeFalse();
  });

  test("keeps lead-row tree prefixes when multiline text is width-constrained", async () => {
    const program = Effect.gen(function* () {
      const fiber = yield* Effect.fork(
        Progress.task(
          Effect.gen(function* () {
            const progress = yield* Progress.Progress;
            const parentId = yield* progress.addTask({
              description: "parent-with-a-very-long-description-to-force-shrinking",
              total: 100,
              transient: false,
            });
            yield* progress.addTask({
              description:
                "child-1-very-long-description-to-demonstrate-tree-prefix-preservation-under-width-caps",
              parentId,
              total: 100,
              transient: false,
            });
            yield* progress.addTask({
              description:
                "child-2-very-long-description-to-demonstrate-tree-prefix-preservation-under-width-caps",
              parentId,
              total: 100,
              transient: false,
            });

            while (true) {
              yield* Effect.sleep("5 millis");
              yield* progress.advanceTask(parentId, 1);
            }
          }),
          { description: "root", transient: false },
        ).pipe(
          Effect.provideService(Progress.RendererConfig, {
            maxLogLines: 0,
            maxTaskWidth: 60,
            renderIntervalMillis: 5,
            nonTtyUpdateStep: 1,
            disableUserInput: false,
            determinateTaskLayout: "two-lines",
          }),
        ),
      );

      yield* Effect.sleep("40 millis");
      yield* Fiber.interrupt(fiber);
    });

    const { stream } = await captureTerminalOutput(program);
    const finalScreen = renderFinalScreen(stream);
    const childLeadLine =
      finalScreen.find((line) => line.includes("child-1-very-long-description")) ?? "";

    expect(childLeadLine.length).toBeGreaterThan(0);
    expect(childLeadLine.includes("├") || childLeadLine.includes("└")).toBeTrue();
  });

  test("completed determinate tasks keep a done-colored bar instead of done label", async () => {
    const program = Progress.all([Effect.sleep("5 millis")], {
      description: "single-determinate",
      transient: false,
    }).pipe(
      Effect.provideService(Progress.RendererConfig, {
        maxLogLines: 0,
        renderIntervalMillis: 5,
        nonTtyUpdateStep: 1,
        disableUserInput: false,
      }),
    );

    const { stream } = await captureTerminalOutput(program);
    const finalScreen = renderFinalScreen(stream);
    const determinateLine = finalScreen.find((line) => line.includes("single-determinate"));
    const statsLine = finalScreen.find((line) => line.includes("1/1"));

    expect(determinateLine !== undefined).toBeTrue();
    expect(statsLine !== undefined).toBeTrue();
    expect(finalScreen.some((line) => line.includes("done"))).toBeFalse();
  });
});
