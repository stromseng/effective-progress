import { describe, expect, test } from "bun:test";
import { Console, Effect } from "effect";
import * as Progress from "../src";

const stripAnsi = (value: string): string =>
  value.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "");

const captureTerminalOutput = async <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  options: {
    readonly isTTY: boolean;
  },
) => {
  let stream = "";

  const terminal: Progress.ProgressTerminalService = {
    isTTY: Effect.succeed(options.isTTY),
    stderrRows: Effect.succeed(120),
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

  return {
    result,
    output: stripAnsi(stream),
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

    const { output } = await captureTerminalOutput(program, { isTTY: true });

    expect(output.includes("parent")).toBeTrue();
    expect(output.includes("child")).toBeTrue();
    expect(output.includes("└─ child") || output.includes("├─ child")).toBeTrue();
  });

  test("emits logs through custom Effect Console while Ink is active", async () => {
    const logs: Array<ReadonlyArray<unknown>> = [];

    const result = await captureTerminalOutput(
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
    const { output } = await captureTerminalOutput(
      Progress.all([Effect.sleep("2 millis")], { description: "non-tty-task", transient: false }),
      { isTTY: false },
    );

    expect(output.includes("non-tty-task")).toBeTrue();
  });
});
