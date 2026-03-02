import { describe, expect, test } from "bun:test";
import { Console, Effect } from "effect";
import * as Progress from "../src";
import { createMockStdio } from "./helpers/mock-stdio";

const ANSI_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[ -/]*[@-~]`, "g");

const stripAnsi = (value: string): string => value.replace(ANSI_PATTERN, "");

const captureStdioOutput = async <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  options: {
    readonly isTTY: boolean;
  },
) => {
  const stdio = createMockStdio({
    stdout: { isTTY: options.isTTY, columns: 160, rows: 120 },
    stderr: { isTTY: options.isTTY, columns: 160, rows: 120 },
  });

  const result = await Effect.runPromise(
    effect.pipe(Effect.provideService(Progress.ProgressStdio, stdio.service)) as Effect.Effect<
      A,
      E,
      never
    >,
  );

  return {
    result,
    stdout: stripAnsi(stdio.stdout.getOutput()),
    stderr: stripAnsi(stdio.stderr.getOutput()),
    output: stripAnsi(`${stdio.stdout.getOutput()}${stdio.stderr.getOutput()}`),
  };
};

describe("Ink renderer integration", () => {
  test("renders nested tasks with tree connectors", async () => {
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

        yield* progress.advanceTask(parentId, 1);
        yield* progress.advanceTask(childId, 1);
        yield* progress.completeTask(childId);
        yield* progress.completeTask(parentId);
      }),
      { description: "root", transient: false },
    );

    const { output } = await captureStdioOutput(program, { isTTY: true });

    expect(output.includes("parent")).toBeTrue();
    expect(output.includes("child")).toBeTrue();
    expect(output.includes("└─ child") || output.includes("├─ child")).toBeTrue();
  });

  test("emits logs through custom Effect Console while Ink is active", async () => {
    const logs: Array<ReadonlyArray<unknown>> = [];

    const result = await captureStdioOutput(
      Effect.gen(function* () {
        const outer = yield* Console.consoleWith((console) => Effect.succeed(console));
        const consoleSpy: Console.Console = {
          ...outer,
          log: (...args) => {
            logs.push(args);
            return Effect.void;
          },
          unsafe: {
            ...outer.unsafe,
            log: (...args) => {
              logs.push(args);
            },
          },
        };

        return yield* Effect.withConsole(
          Progress.task(
            Effect.gen(function* () {
              yield* Console.log("custom-log-line");
              yield* Effect.sleep("5 millis");
            }),
            { description: "log-task", transient: false },
          ),
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
});
