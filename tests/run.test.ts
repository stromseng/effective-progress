import { describe, expect, test } from "bun:test";
import { Console, Effect, Option } from "effect";
import * as Progress from "../src";

const withLogSpy = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const outer = yield* Console.consoleWith((console) => Effect.succeed(console));
    const logs: Array<ReadonlyArray<unknown>> = [];

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

    const result = yield* Effect.withConsole(effect, consoleSpy);
    return { result, logs };
  });

const withNonTTYRenderer = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.provideService(Progress.RendererConfig, {
      renderIntervalMillis: 1000,
      disableUserInput: true,
    }),
    Effect.provideService(Progress.ProgressTerminal, {
      isTTY: Effect.succeed(false),
      stderrRows: Effect.sync(() => undefined),
      stderrColumns: Effect.sync(() => undefined),
      writeStderr: () => Effect.void,
      withRawInputCapture: (innerEffect) => innerEffect,
    } satisfies Progress.ProgressTerminalService),
  );

describe("Progress.run", () => {
  test("plain logs are not swallowed when no tasks are created", async () => {
    const message = "plain-log-no-task";
    const { logs } = await Effect.runPromise(withLogSpy(withNonTTYRenderer(Console.log(message))));

    expect(logs.some((args) => args[0] === message)).toBeTrue();
  });

  test("nested run reuses the outer service", async () => {
    const reused = await Effect.runPromise(
      withNonTTYRenderer(
        Progress.withTask(
          { description: "outer-service", transient: true },
          Effect.gen(function* () {
            const outer = yield* Progress.Progress;
            return yield* Progress.withTask(
              { description: "inner-service", transient: true },
              Effect.gen(function* () {
                const inner = yield* Progress.Progress;
                return outer === inner;
              }),
            );
          }),
        ),
      ),
    );

    expect(reused).toBeTrue();
  });

  test("manual withTask auto-captures logs and provides Task context", async () => {
    const capturedMessage = "manual-captured";

    const { result, logs } = await Effect.runPromise(
      withLogSpy(
        withNonTTYRenderer(
          Progress.withTask(
            { description: "manual-context", transient: true },
            Effect.gen(function* () {
              const progress = yield* Progress.Progress;

              const taskIdFromContext = yield* progress.withTask(
                { description: "captured-task", transient: false },
                Effect.gen(function* () {
                  yield* Console.log(capturedMessage);
                  return yield* Progress.Task;
                }),
              );

              const task = yield* progress.getTask(taskIdFromContext);
              return Option.isSome(task);
            }),
          ),
        ),
      ),
    );

    expect(logs.some((args) => args[0] === capturedMessage)).toBeFalse();
    expect(result).toBeTrue();
  });

  test("top-level Progress.withTask auto-provides Progress service", async () => {
    const capturedMessage = "top-level-with-task";
    const { result, logs } = await Effect.runPromise(
      withLogSpy(
        withNonTTYRenderer(
          Progress.withTask(
            { description: "top-level-task" },
            Effect.gen(function* () {
              const progress = yield* Progress.Progress;
              const taskId = yield* Progress.Task;
              yield* Console.log(capturedMessage);
              return yield* progress.getTask(taskId).pipe(Effect.map(Option.isSome));
            }),
          ),
        ),
      ),
    );

    expect(logs.some((args) => args[0] === capturedMessage)).toBeFalse();
    expect(result).toBeTrue();
  });

  test("all auto-captures callback Console.log", async () => {
    const capturedMessage = "all-auto-captured";

    const { logs } = await Effect.runPromise(
      withLogSpy(
        withNonTTYRenderer(
          Progress.all([Console.log(capturedMessage)], { description: "auto-capture-all" }),
        ),
      ),
    );

    expect(logs.some((args) => args[0] === capturedMessage)).toBeFalse();
  });
});
