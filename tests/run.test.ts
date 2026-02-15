import { describe, expect, test } from "bun:test";
import { Console, Effect, Option } from "effect";
import { pipe } from "effect/Function";
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
        Progress.task(
          Effect.gen(function* () {
            const outer = yield* Progress.Progress;
            return yield* Progress.task(
              Effect.gen(function* () {
                const inner = yield* Progress.Progress;
                return outer === inner;
              }),
              { description: "inner-service", transient: true },
            );
          }),
          { description: "outer-service", transient: true },
        ),
      ),
    );

    expect(reused).toBeTrue();
  });

  test("manual task auto-captures logs and provides Task context", async () => {
    const capturedMessage = "manual-captured";

    const { result, logs } = await Effect.runPromise(
      withLogSpy(
        withNonTTYRenderer(
          Progress.task(
            Effect.gen(function* () {
              const progress = yield* Progress.Progress;

              const taskIdFromContext = yield* progress.withTask(
                Effect.gen(function* () {
                  yield* Console.log(capturedMessage);
                  return yield* Progress.Task;
                }),
                { description: "captured-task", transient: false },
              );

              const task = yield* progress.getTask(taskIdFromContext);
              return Option.isSome(task);
            }),
            { description: "manual-context", transient: true },
          ),
        ),
      ),
    );

    expect(logs.some((args) => args[0] === capturedMessage)).toBeFalse();
    expect(result).toBeTrue();
  });

  test("top-level Progress.task auto-provides Progress service", async () => {
    const capturedMessage = "top-level-with-task";
    const { result, logs } = await Effect.runPromise(
      withLogSpy(
        withNonTTYRenderer(
          Progress.task(
            Effect.gen(function* () {
              const progress = yield* Progress.Progress;
              const taskId = yield* Progress.Task;
              yield* Console.log(capturedMessage);
              return yield* progress.getTask(taskId).pipe(Effect.map(Option.isSome));
            }),
            { description: "top-level-task" },
          ),
        ),
      ),
    );

    expect(logs.some((args) => args[0] === capturedMessage)).toBeFalse();
    expect(result).toBeTrue();
  });

  test("all returns the values from each effect", async () => {
    const result = await Effect.runPromise(
      withNonTTYRenderer(
        Progress.all([Effect.succeed(1), Effect.succeed("two"), Effect.succeed(true)], {
          description: "return-values",
        }),
      ),
    );

    expect(result).toEqual([1, "two", true]);
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

  test("all supports pipe form", async () => {
    const capturedMessage = "all-auto-captured-pipe";

    const { logs } = await Effect.runPromise(
      withLogSpy(
        withNonTTYRenderer(
          pipe(
            [Console.log(capturedMessage)],
            Progress.all({
              description: "auto-capture-all-pipe",
            }),
          ),
        ),
      ),
    );

    expect(logs.some((args) => args[0] === capturedMessage)).toBeFalse();
  });

  test("forEach supports pipe form", async () => {
    const capturedPrefix = "forEach-auto-captured-pipe";

    const { result, logs } = await Effect.runPromise(
      withLogSpy(
        withNonTTYRenderer(
          pipe(
            ["a", "b"],
            Progress.forEach((item) => Console.log(`${capturedPrefix}:${item}`), {
              description: "auto-capture-foreach-pipe",
            }),
          ),
        ),
      ),
    );

    expect(result).toEqual([undefined, undefined]);
    expect(
      logs.some((args) => typeof args[0] === "string" && args[0].startsWith(capturedPrefix)),
    ).toBeFalse();
  });
});
