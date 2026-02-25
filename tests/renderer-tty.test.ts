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

const firstBarIndex = (line: string): number => {
  const filled = line.indexOf("━");
  if (filled >= 0) {
    return filled;
  }
  return line.indexOf("─");
};

const longestBarRun = (line: string): number =>
  (line.match(/[━─]+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 0);

describe("TTY renderer integration", () => {
  test("preserves plain interstitial logs and renders final completed frame", async () => {
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
    expect(finalScreen.some((line) => line.includes("✓"))).toBeTrue();
  });

  test("keeps bars aligned across nested tasks", async () => {
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
            const child1Id = yield* progress.addTask({
              description: "child-1",
              parentId,
              total: 100,
              transient: false,
            });
            const child2Id = yield* progress.addTask({
              description: "child-2",
              parentId,
              total: 100,
              transient: false,
            });

            while (true) {
              yield* Effect.sleep("5 millis");
              yield* progress.advanceTask(parentId, 1);
              yield* progress.advanceTask(child1Id, 1);
              yield* progress.advanceTask(child2Id, 1);
            }
          }),
          { description: "root", transient: false },
        ).pipe(
          Effect.provideService(Progress.RendererConfig, {
            maxLogLines: 0,
            renderIntervalMillis: 5,
            nonTtyUpdateStep: 1,
            disableUserInput: false,
          }),
        ),
      );

      yield* Effect.sleep("40 millis");
      yield* Fiber.interrupt(fiber);
    });

    const { stream } = await captureTerminalOutput(program);
    const finalScreen = renderFinalScreen(stream);

    const parentLine = finalScreen.find((line) => line.includes("parent")) ?? "";
    const childLine = finalScreen.find((line) => line.includes("child-1")) ?? "";

    const parentBarIndex = firstBarIndex(parentLine);
    const childBarIndex = firstBarIndex(childLine);

    expect(parentLine.includes("parent")).toBeTrue();
    expect(childLine.includes("child-1")).toBeTrue();
    expect(childLine.includes("├─") || childLine.includes("└─")).toBeTrue();
    expect(parentBarIndex).toBeGreaterThanOrEqual(0);
    expect(childBarIndex).toBeGreaterThanOrEqual(0);
    expect(parentBarIndex).toBe(childBarIndex);
  });

  test("renders elapsed before eta for running determinate tasks in seconds format", async () => {
    const program = Effect.gen(function* () {
      const fiber = yield* Effect.fork(
        Progress.task(
          Effect.gen(function* () {
            const progress = yield* Progress.Progress;
            const taskId = yield* progress.addTask({
              description: "timing-order",
              total: 100,
              transient: false,
            });

            while (true) {
              yield* Effect.sleep("5 millis");
              yield* progress.advanceTask(taskId, 1);
            }
          }),
          { description: "root", transient: false },
        ).pipe(
          Effect.provideService(Progress.RendererConfig, {
            maxLogLines: 0,
            renderIntervalMillis: 5,
            nonTtyUpdateStep: 1,
            disableUserInput: false,
          }),
        ),
      );

      yield* Effect.sleep("40 millis");
      yield* Fiber.interrupt(fiber);
    });

    const { stream } = await captureTerminalOutput(program);
    const finalScreen = renderFinalScreen(stream);
    const taskLine = finalScreen.find((line) => line.includes("timing-order")) ?? "";
    const unitsMatch = taskLine.match(/\d+\/\d+/);
    const etaIndex = taskLine.indexOf("ETA:");
    const firstDurationIndex = taskLine.search(/\b\d+s\b/);
    const etaDurationMatch = taskLine.match(/ETA:\s+\d+s/);

    expect(taskLine.length).toBeGreaterThan(0);
    expect(unitsMatch !== null).toBeTrue();
    expect(etaIndex).toBeGreaterThanOrEqual(0);
    expect(firstDurationIndex).toBeGreaterThanOrEqual(0);
    expect(firstDurationIndex).toBeGreaterThan(
      (unitsMatch?.index ?? -1) + (unitsMatch?.[0].length ?? 0),
    );
    expect(firstDurationIndex).toBeLessThan(etaIndex);
    expect(etaDurationMatch !== null).toBeTrue();
    expect(taskLine.includes("ms")).toBeFalse();
  });

  test("left-pads completed units to total width for determinate tasks", async () => {
    const program = Effect.gen(function* () {
      const fiber = yield* Effect.fork(
        Progress.task(
          Effect.gen(function* () {
            const progress = yield* Progress.Progress;
            const taskId = yield* progress.addTask({
              description: "units-padding",
              total: 15,
              transient: false,
            });

            yield* progress.advanceTask(taskId, 7);

            while (true) {
              yield* Effect.sleep("5 millis");
            }
          }),
          { description: "root", transient: false },
        ).pipe(
          Effect.provideService(Progress.RendererConfig, {
            maxLogLines: 0,
            renderIntervalMillis: 5,
            nonTtyUpdateStep: 1,
            disableUserInput: false,
          }),
        ),
      );

      yield* Effect.sleep("40 millis");
      yield* Fiber.interrupt(fiber);
    });

    const { stream } = await captureTerminalOutput(program);
    const finalScreen = renderFinalScreen(stream);
    const taskLine = finalScreen.find((line) => line.includes("units-padding")) ?? "";
    const paddedUnitsMatch = taskLine.match(/\s{2,}7\/15\b/);

    expect(taskLine.length).toBeGreaterThan(0);
    expect(paddedUnitsMatch !== null).toBeTrue();
  });

  test("completed determinate tasks keep amount output", async () => {
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

  test("responsive shrink strips tree and eta prefixes on narrow widths", async () => {
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
            const childId = yield* progress.addTask({
              description: "child",
              parentId,
              total: 100,
              transient: false,
            });

            while (true) {
              yield* Effect.sleep("5 millis");
              yield* progress.advanceTask(parentId, 1);
              yield* progress.advanceTask(childId, 1);
            }
          }),
          { description: "root", transient: false },
        ).pipe(
          Effect.provideService(Progress.RendererConfig, {
            maxLogLines: 0,
            renderIntervalMillis: 5,
            nonTtyUpdateStep: 1,
            disableUserInput: false,
            width: 8,
            columns: [
              Progress.DescriptionColumn.make({ minWidth: 0 }),
              Progress.EtaColumn.make({ minWidth: 0 }),
            ],
          }),
        ),
      );

      yield* Effect.sleep("40 millis");
      yield* Fiber.interrupt(fiber);
    });

    const { stream } = await captureTerminalOutput(program);
    const finalScreen = renderFinalScreen(stream);
    const childLine = finalScreen.find((line) => line.includes("child")) ?? "";

    expect(childLine.length).toBeGreaterThan(0);
    expect(childLine.includes("├")).toBeFalse();
    expect(childLine.includes("└")).toBeFalse();
    expect(childLine.includes("ETA:")).toBeFalse();
    expect(/\b\d+s\b/.test(childLine)).toBeTrue();
  });

  test("shrinks bar before truncating description", async () => {
    const program = Effect.gen(function* () {
      const fiber = yield* Effect.fork(
        Progress.task(
          Effect.gen(function* () {
            const progress = yield* Progress.Progress;
            const parentId = yield* progress.addTask({
              description: "parent-token-with-description-needs-compression",
              total: 100,
              transient: false,
            });
            const childId = yield* progress.addTask({
              description: "child-token-with-description-needs-compression",
              parentId,
              total: 100,
              transient: false,
            });

            while (true) {
              yield* Effect.sleep("5 millis");
              yield* progress.advanceTask(parentId, 1);
              yield* progress.advanceTask(childId, 1);
            }
          }),
          { description: "root", transient: false },
        ).pipe(
          Effect.provideService(Progress.RendererConfig, {
            maxLogLines: 0,
            renderIntervalMillis: 5,
            nonTtyUpdateStep: 1,
            disableUserInput: false,
            width: 80,
          }),
        ),
      );

      yield* Effect.sleep("40 millis");
      yield* Fiber.interrupt(fiber);
    });

    const { stream } = await captureTerminalOutput(program);
    const finalScreen = renderFinalScreen(stream);
    const childLine =
      finalScreen.find((line) => line.includes("child-token-with-description")) ?? "";

    expect(childLine.length).toBeGreaterThan(0);
    expect(childLine.includes("├─") || childLine.includes("└─")).toBeTrue();
    expect(childLine.includes("compression")).toBeTrue();
    expect(longestBarRun(childLine)).toBeLessThanOrEqual(10);
  });
});
