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

const withTerminal = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
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
    const { logs } = await Effect.runPromise(withLogSpy(withTerminal(Console.log(message))));

    expect(logs.some((args) => args[0] === message)).toBeTrue();
  });

  test("nested run reuses the outer service", async () => {
    const reused = await Effect.runPromise(
      withTerminal(
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

  test("manual task delegates Console.log to the outer console and provides Task context", async () => {
    const capturedMessage = "manual-captured";

    const { result, logs } = await Effect.runPromise(
      withLogSpy(
        withTerminal(
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
            { description: "manual-context", transient: false },
          ),
        ),
      ),
    );

    expect(logs.some((args) => args[0] === capturedMessage)).toBeTrue();
    expect(result).toBeTrue();
  });

  test("all returns the values from each effect", async () => {
    const result = await Effect.runPromise(
      withTerminal(
        Progress.all([Effect.succeed(1), Effect.succeed("two"), Effect.succeed(true)], {
          description: "return-values",
        }),
      ),
    );

    expect(result).toEqual([1, "two", true]);
  });

  test("all delegates callback Console.log to the outer console", async () => {
    const capturedMessage = "all-auto-captured";

    const { logs } = await Effect.runPromise(
      withLogSpy(withTerminal(Progress.all([Console.log(capturedMessage)], { description: "all" }))),
    );

    expect(logs.some((args) => args[0] === capturedMessage)).toBeTrue();
  });

  test("task replays Console.dir with raw arguments", async () => {
    const payload = { nested: { value: 1 } };
    type DirOptions = Parameters<Console.Console["dir"]>[1];
    const options: DirOptions = { depth: 1 };
    let captured:
      | {
          readonly item: unknown;
          readonly options: DirOptions;
        }
      | undefined;

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const outer = yield* Console.consoleWith((console) => Effect.succeed(console));
        const consoleSpy: Console.Console = {
          ...outer,
          dir: (item, nextOptions) => {
            captured = { item, options: nextOptions };
            return Effect.void;
          },
          unsafe: {
            ...outer.unsafe,
            dir: (item, nextOptions) => {
              captured = { item, options: nextOptions };
            },
          },
        };

        return yield* Effect.withConsole(
          withTerminal(
            Progress.task(
              Effect.gen(function* () {
                yield* Console.dir(payload, options);
                return true;
              }),
              { description: "dir-replay" },
            ),
          ),
          consoleSpy,
        );
      }),
    );

    expect(result).toBeTrue();
    expect(captured?.item).toEqual(payload);
    expect(captured?.options).toEqual(options);
  });

  test("all supports pipe form", async () => {
    const capturedMessage = "all-auto-captured-pipe";

    const { logs } = await Effect.runPromise(
      withLogSpy(
        withTerminal(
          pipe(
            [Console.log(capturedMessage)],
            Progress.all({
              description: "all-pipe",
            }),
          ),
        ),
      ),
    );

    expect(logs.some((args) => args[0] === capturedMessage)).toBeTrue();
  });

  test("forEach supports pipe form", async () => {
    const capturedPrefix = "forEach-auto-captured-pipe";

    const { result, logs } = await Effect.runPromise(
      withLogSpy(
        withTerminal(
          pipe(
            ["a", "b"],
            Progress.forEach((item) => Console.log(`${capturedPrefix}:${item}`), {
              description: "foreach-pipe",
            }),
          ),
        ),
      ),
    );

    expect(result).toEqual([undefined, undefined]);
    expect(
      logs.some((args) => typeof args[0] === "string" && args[0].startsWith(capturedPrefix)),
    ).toBeTrue();
  });
});
