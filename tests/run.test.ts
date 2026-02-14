import { describe, expect, test } from "bun:test";
import { Console, Effect } from "effect";
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
      isTTY: false,
      renderIntervalMillis: 1000,
      disableUserInput: true,
    }),
  );

describe("Progress.run", () => {
  test("plain logs are not swallowed when no tasks are created", async () => {
    const message = "plain-log-no-task";
    const { logs } = await Effect.runPromise(
      withLogSpy(
        withNonTTYRenderer(
          Progress.provide(
            Effect.gen(function* () {
              yield* Console.log(message);
            }),
          ),
        ),
      ),
    );

    expect(logs.some((args) => args[0] === message)).toBeTrue();
  });

  test("nested run reuses the outer service", async () => {
    const reused = await Effect.runPromise(
      withNonTTYRenderer(
        Progress.provide(
          Effect.gen(function* () {
            const outer = yield* Progress.Progress;
            return yield* Progress.provide(
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

  test("manual mode requires explicit withCapturedLogs for progress log capture", async () => {
    const uncapturedMessage = "manual-uncaptured";
    const capturedMessage = "manual-captured";

    const { logs } = await Effect.runPromise(
      withLogSpy(
        withNonTTYRenderer(
          Progress.provide(
            Effect.gen(function* () {
              const progress = yield* Progress.Progress;

              yield* progress.withTask(
                { description: "uncaptured-task" },
                () => Console.log(uncapturedMessage),
              );

              yield* progress.withTask(
                { description: "captured-task" },
                () => progress.withCapturedLogs(Console.log(capturedMessage)),
              );
            }),
          ),
        ),
      ),
    );

    expect(logs.some((args) => args[0] === uncapturedMessage)).toBeTrue();
    expect(logs.some((args) => args[0] === capturedMessage)).toBeFalse();
  });

  test("all auto-captures callback Console.log", async () => {
    const capturedMessage = "all-auto-captured";

    const { logs } = await Effect.runPromise(
      withLogSpy(
        withNonTTYRenderer(
          Progress.all(
            [
              Effect.gen(function* () {
                yield* Console.log(capturedMessage);
              }),
            ],
            { description: "auto-capture-all" },
          ),
        ),
      ),
    );

    expect(logs.some((args) => args[0] === capturedMessage)).toBeFalse();
  });
});
