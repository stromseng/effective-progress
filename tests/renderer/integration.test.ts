import { describe, expect, test } from "bun:test";
import { Console, Effect } from "effect";
import stripAnsi from "strip-ansi";
import * as Progress from "../../src";
import { createMockStdio } from "../helpers/mock-stdio";

const captureStdioOutput = async <A, E>(
  effect: Effect.Effect<A, E, Progress.ProgressStdio>,
  options: {
    readonly isTTY: boolean;
    readonly columns?: number;
  },
) => {
  const stdio = createMockStdio({
    stdout: { isTTY: options.isTTY, columns: options.columns ?? 160, rows: 120 },
    stderr: { isTTY: options.isTTY, columns: options.columns ?? 160, rows: 120 },
  });

  const result = await Effect.runPromise(
    effect.pipe(Effect.provideService(Progress.ProgressStdio, stdio.service)),
  );

  return {
    result,
    rawStdout: stdio.stdout.getOutput(),
    rawStderr: stdio.stderr.getOutput(),
    rawOutput: `${stdio.stdout.getOutput()}${stdio.stderr.getOutput()}`,
    stdout: stripAnsi(stdio.stdout.getOutput()),
    stderr: stripAnsi(stdio.stderr.getOutput()),
    output: stripAnsi(`${stdio.stdout.getOutput()}${stdio.stderr.getOutput()}`),
  };
};

describe("Ink renderer integration", () => {
  test.each(["all", "forEach"] as const)("%s renders custom columns", async (method) => {
    const options = {
      description: "custom collection",
      columns: [{ render: () => "CUSTOM_COLLECTION_COLUMN" }],
    };
    const program =
      method === "all"
        ? Progress.all([Effect.void], options)
        : Progress.forEach([1], () => Effect.void, options);

    const { output } = await captureStdioOutput(program, { isTTY: false });

    expect(output).toContain("CUSTOM_COLLECTION_COLUMN");
  });

  test("renders nested task rows", async () => {
    const program = Progress.task(
      Effect.gen(function* () {
        const progress = yield* Progress.Progress;
        const parentId = yield* progress.addTask({
          description: "parent",
          total: 1,
          transient: false,
        });
        const childId = yield* progress.addTask({
          description: "child",
          parentId,
          total: 1,
          transient: false,
        });

        yield* progress.incrementSucceeded(parentId, 1);
        yield* progress.incrementSucceeded(childId, 1);
        yield* progress.completeTask(childId);
        yield* progress.completeTask(parentId);
      }),
      { description: "root", transient: false },
    );

    const { output } = await captureStdioOutput(program, { isTTY: true });

    expect(output.includes("parent")).toBeTrue();
    expect(output.includes("child")).toBeTrue();
  });

  test("emits logs through custom Effect Console while Ink is active", async () => {
    const logs: Array<ReadonlyArray<unknown>> = [];

    const result = await captureStdioOutput(
      Effect.gen(function* () {
        const outer = yield* Console.Console;
        const consoleSpy: Console.Console = {
          ...outer,
          log: (...args) => {
            logs.push(args);
          },
        };

        return yield* Effect.provideService(
          Progress.task(
            Effect.gen(function* () {
              yield* Console.log("custom-log-line");
              yield* Effect.sleep("5 millis");
            }),
            { description: "log-task", transient: false },
          ),
          Console.Console,
          consoleSpy,
        );
      }),
      { isTTY: true },
    );

    expect(logs.some((args) => args[0] === "custom-log-line")).toBeTrue();
    expect(result.output.includes("log-task")).toBeTrue();
  });

  test("renders in non-tty mode via Ink without custom fallback renderer", async () => {
    const { output } = await captureStdioOutput(
      Progress.all([Effect.sleep("2 millis")], { description: "non-tty-task", transient: false }),
      { isTTY: false },
    );

    expect(output.includes("non-tty-task")).toBeTrue();
  });

  test("renders mixed outcome amount text and segmented bar", async () => {
    const { output } = await captureStdioOutput(
      Progress.task(
        Effect.gen(function* () {
          const progress = yield* Progress.Progress;
          const taskId = yield* progress.addTask({
            description: "mixed-counts",
            total: 10,
            transient: false,
          });

          yield* progress.incrementSucceeded(taskId, 6);
          yield* progress.incrementFailed(taskId, 2);
          yield* progress.failTask(taskId);
        }),
        { description: "mixed-root", transient: false },
      ),
      { isTTY: true },
    );

    const taskLine = output.split("\n").find((line) => line.includes("mixed-counts")) ?? "";

    expect(output.includes("8/10")).toBeTrue();
    expect(taskLine.includes("━")).toBeTrue();
    expect(taskLine.includes("─")).toBeTrue();
  });

  test("renders raw overflow counts with a fully clamped bar", async () => {
    const { output } = await captureStdioOutput(
      Progress.task(
        Effect.gen(function* () {
          const progress = yield* Progress.Progress;
          const taskId = yield* progress.addTask({
            description: "overflow-counts",
            total: 5,
            transient: false,
          });

          yield* progress.incrementSucceeded(taskId, 6);
          yield* progress.incrementFailed(taskId, 2);
          yield* progress.completeTask(taskId);
        }),
        { description: "overflow-root", transient: false },
      ),
      { isTTY: true },
    );

    const taskLine = output.split("\n").find((line) => line.includes("overflow-counts")) ?? "";
    const renderedBar = taskLine.split("overflow-counts")[1] ?? "";

    expect(taskLine.includes("8/5")).toBeTrue();
    expect(renderedBar.includes("━")).toBeTrue();
    expect(renderedBar.includes("─")).toBeFalse();
  });

  test("renders zero-total determinate tasks as full bars", async () => {
    const { output } = await captureStdioOutput(
      Progress.task(
        Effect.gen(function* () {
          const progress = yield* Progress.Progress;
          const taskId = yield* progress.addTask({
            description: "zero-total",
            total: 0,
            transient: false,
            countDisplay: "processedOnly",
          });

          yield* progress.completeTask(taskId);
        }),
        { description: "zero-root", transient: false },
      ),
      { isTTY: true },
    );

    const taskLine = output.split("\n").find((line) => line.includes("zero-total")) ?? "";
    const renderedBar = taskLine.split("zero-total")[1] ?? "";

    expect(taskLine.includes("0/0")).toBeTrue();
    expect(renderedBar.includes("━")).toBeTrue();
    expect(renderedBar.includes("─")).toBeFalse();
  });

  test("aligns slash position between fail-fast and fully-accounted rows", async () => {
    const { output } = await captureStdioOutput(
      Progress.task(
        Effect.gen(function* () {
          const progress = yield* Progress.Progress;

          const failFastLikeId = yield* progress.addTask({
            description: "fail-fast-like",
            total: 4,
            transient: false,
            countDisplay: "processedOnly",
          });
          yield* progress.incrementSucceeded(failFastLikeId, 3);
          yield* progress.failTask(failFastLikeId);

          const fullyAccountedId = yield* progress.addTask({
            description: "fully-accounted",
            total: 4,
            transient: false,
            countDisplay: "detailed",
          });
          yield* progress.incrementSucceeded(fullyAccountedId, 3);
          yield* progress.incrementFailed(fullyAccountedId, 1);
          yield* progress.failTask(fullyAccountedId);
        }),
        { description: "alignment-root", transient: false },
      ),
      { isTTY: true },
    );

    const failFastLine = output.split("\n").find((line) => line.includes("fail-fast-like")) ?? "";
    const fullyAccountedLine =
      output.split("\n").find((line) => line.includes("fully-accounted")) ?? "";

    expect(failFastLine.includes("3/4")).toBeTrue();
    expect(fullyAccountedLine.includes("4/4")).toBeTrue();
    expect(failFastLine.indexOf("/")).toBe(fullyAccountedLine.indexOf("/"));
  });

  test("renders completion indicators next to description text", async () => {
    const { output } = await captureStdioOutput(
      Progress.task(
        Effect.gen(function* () {
          const progress = yield* Progress.Progress;

          const fullSuccessId = yield* progress.addTask({
            description: "full-success",
            total: 4,
            transient: false,
          });
          yield* progress.incrementSucceeded(fullSuccessId, 4);
          yield* progress.completeTask(fullSuccessId);

          const partialSuccessId = yield* progress.addTask({
            description: "partial-success",
            total: 4,
            transient: false,
          });
          yield* progress.incrementSucceeded(partialSuccessId, 3);
          yield* progress.incrementFailed(partialSuccessId, 1);
          yield* progress.completeTask(partialSuccessId);

          const failedId = yield* progress.addTask({
            description: "failed-task",
            total: 4,
            transient: false,
          });
          yield* progress.incrementFailed(failedId, 1);
          yield* progress.failTask(failedId);
        }),
        { description: "indicator-root", transient: false },
      ),
      { isTTY: true },
    );

    expect(output.includes("✓ full-success")).toBeTrue();
    expect(output.includes("~ partial-success")).toBeTrue();
    expect(output.includes("✗ failed-task")).toBeTrue();
  });

  test("renders only description and elapsed when no determinate tasks exist", async () => {
    const { output } = await captureStdioOutput(
      Progress.task(Effect.sleep("10 millis"), {
        description: "indeterminate-single",
        transient: false,
      }),
      { isTTY: true },
    );

    const line =
      output.split("\n").find((candidate) => candidate.includes("indeterminate-single")) ?? "";
    expect(line.includes("indeterminate-single")).toBeTrue();
    expect(/\d{2}:\d{2}<\d{2}:\d{2}/.test(line)).toBeTrue();
    expect(line.includes("%")).toBeFalse();
    expect(line.includes("ETA:")).toBeFalse();
  });

  test("renders counted indeterminate amounts with unknown total", async () => {
    const { output } = await captureStdioOutput(
      Progress.task(
        Effect.gen(function* () {
          const progress = yield* Progress.Progress;

          const failFastId = yield* progress.addTask({
            description: "stream-fail-fast",
            transient: false,
            countDisplay: "processedOnly",
          });
          yield* progress.incrementFailed(failFastId, 3);
          yield* progress.failTask(failFastId);

          const detailedId = yield* progress.addTask({
            description: "stream-collect-all",
            transient: false,
            countDisplay: "detailed",
          });
          yield* progress.incrementSucceeded(detailedId, 3);
          yield* progress.incrementFailed(detailedId, 1);
          yield* progress.completeTask(detailedId);
        }),
        { description: "unknown-total-root", transient: false },
      ),
      { isTTY: true },
    );

    const failFastLine = output.split("\n").find((line) => line.includes("stream-fail-fast")) ?? "";
    const detailedLine =
      output.split("\n").find((line) => line.includes("stream-collect-all")) ?? "";

    expect(failFastLine.includes("3/?")).toBeTrue();
    expect(detailedLine.includes("3 1 4/4")).toBeTrue();
  });

  test("does not wrap amount text into stacked lines on narrow terminals", async () => {
    const { output } = await captureStdioOutput(
      Progress.task(
        Effect.gen(function* () {
          const progress = yield* Progress.Progress;

          const failFastId = yield* progress.addTask({
            description: "default mode (fail-fast)",
            total: 4,
            transient: false,
            countDisplay: "processedOnly",
          });
          yield* progress.incrementSucceeded(failFastId, 3);
          yield* progress.failTask(failFastId);

          const detailedId = yield* progress.addTask({
            description: "result mode (collect all outcomes)",
            total: 4,
            transient: false,
            countDisplay: "detailed",
          });
          yield* progress.incrementSucceeded(detailedId, 3);
          yield* progress.incrementFailed(detailedId, 1);
          yield* progress.completeTask(detailedId);
        }),
        { description: "Mixed outcomes showcase", transient: false },
      ),
      { isTTY: true, columns: 52 },
    );

    const wrappedSlashLine = /\n\s*\/\s*\n/.test(output);
    expect(wrappedSlashLine).toBeFalse();
  });
});
