import { describe, expect, test } from "bun:test";
import { Console, Effect, Exit, Option } from "effect";
import { pipe } from "effect/Function";
import * as Progress from "../src";
import { createMockStdio } from "./helpers/mock-stdio";

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

const withStdio = <A, E, R>(effect: Effect.Effect<A, E, R>) => {
  const stdio = createMockStdio();
  return effect.pipe(Effect.provideService(Progress.ProgressStdio, stdio.service));
};

const getTaskByDescription = (
  tasks: ReadonlyArray<Progress.TaskSnapshot>,
  description: string,
): Progress.TaskSnapshot => {
  const task = tasks.find((candidate) => candidate.description === description);
  expect(task, `Task "${description}" not found`).toBeDefined();
  return task!;
};

describe("Progress.run", () => {
  test("plain logs are not swallowed when no tasks are created", async () => {
    const message = "plain-log-no-task";
    const { logs } = await Effect.runPromise(withLogSpy(withStdio(Console.log(message))));

    expect(logs.some((args) => args[0] === message)).toBeTrue();
  });

  test("nested run reuses the outer service", async () => {
    const reused = await Effect.runPromise(
      withStdio(
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
        withStdio(
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
      withStdio(
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
      withLogSpy(withStdio(Progress.all([Console.log(capturedMessage)], { description: "all" }))),
    );

    expect(logs.some((args) => args[0] === capturedMessage)).toBeTrue();
  });

  test("task forwards Console.dir with raw arguments", async () => {
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
          withStdio(
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
        withStdio(
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
        withStdio(
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

  test("task accepts total zero", async () => {
    const result = await Effect.runPromise(
      withStdio(
        Effect.scoped(
          Effect.gen(function* () {
            const progress = yield* Progress.Progress;
            const description = "zero-total-task";
            const value = yield* Progress.task(Effect.succeed("ok"), {
              description,
              total: 0,
            });
            const task = getTaskByDescription(yield* progress.listTasks, description);
            return { value, task };
          }).pipe(Effect.provide(Progress.Progress.Default)),
        ),
      ),
    );

    expect(result.value).toBe("ok");
    expect(result.task.units.total).toBe(0);
    expect(result.task.units.processed).toBe(0);
  });

  test("all accepts an empty array and renders 0/0 counts", async () => {
    const result = await Effect.runPromise(
      withStdio(
        Effect.scoped(
          Effect.gen(function* () {
            const progress = yield* Progress.Progress;
            const description = "empty-all-array";
            const value = yield* Progress.all([], {
              description,
            });
            const task = getTaskByDescription(yield* progress.listTasks, description);
            return { value, task };
          }).pipe(Effect.provide(Progress.Progress.Default)),
        ),
      ),
    );

    expect(result.value).toEqual([]);
    expect(result.task.units.total).toBe(0);
    expect(result.task.units.processed).toBe(0);
    expect(result.task.status).toBe("done");
  });

  test("all accepts an empty object and renders 0/0 counts", async () => {
    const result = await Effect.runPromise(
      withStdio(
        Effect.scoped(
          Effect.gen(function* () {
            const progress = yield* Progress.Progress;
            const description = "empty-all-object";
            const value = yield* Progress.all(
              {},
              {
                description,
              },
            );
            const task = getTaskByDescription(yield* progress.listTasks, description);
            return { value, task };
          }).pipe(Effect.provide(Progress.Progress.Default)),
        ),
      ),
    );

    expect(result.value).toEqual({});
    expect(result.task.units.total).toBe(0);
    expect(result.task.units.processed).toBe(0);
    expect(result.task.status).toBe("done");
  });

  test("forEach accepts an empty iterable with known length and renders 0/0 counts", async () => {
    const result = await Effect.runPromise(
      withStdio(
        Effect.scoped(
          Effect.gen(function* () {
            const progress = yield* Progress.Progress;
            const description = "empty-foreach";
            const value = yield* Progress.forEach([], (item) => Effect.succeed(item), {
              description,
            });
            const task = getTaskByDescription(yield* progress.listTasks, description);
            return { value, task };
          }).pipe(Effect.provide(Progress.Progress.Default)),
        ),
      ),
    );

    expect(result.value).toEqual([]);
    expect(result.task.units.total).toBe(0);
    expect(result.task.units.processed).toBe(0);
    expect(result.task.status).toBe("done");
  });

  test("all fail-fast marks task failed without unresolved failure accounting", async () => {
    const result = await Effect.runPromise(
      withStdio(
        Effect.scoped(
          Effect.gen(function* () {
            const progress = yield* Progress.Progress;
            const description = "all-fail-fast-counters";
            const exit = yield* Effect.exit(
              Progress.all(
                [Effect.fail("boom"), Effect.sleep("50 millis"), Effect.sleep("50 millis")],
                {
                  description,
                  mode: "default",
                },
              ),
            );
            const task = getTaskByDescription(yield* progress.listTasks, description);
            return { exit, task };
          }).pipe(Effect.provide(Progress.Progress.Default)),
        ),
      ),
    );

    expect(Exit.isFailure(result.exit)).toBeTrue();
    expect(result.task.status).toBe("failed");
    expect(result.task.countDisplay).toBe("processedOnly");
    expect(result.task.units.total).toBe(3);
    expect(result.task.units.succeeded).toBe(0);
    expect(result.task.units.failed).toBe(1);
    expect(result.task.units.processed).toBe(1);
    expect(result.task.units.total).toBe(3);
  });

  test("all either mode completes with mixed succeeded/failed counters", async () => {
    const result = await Effect.runPromise(
      withStdio(
        Effect.scoped(
          Effect.gen(function* () {
            const progress = yield* Progress.Progress;
            const description = "all-either-counters";
            const exit = yield* Effect.exit(
              Progress.all([Effect.succeed("ok-1"), Effect.fail("bad"), Effect.succeed("ok-2")], {
                description,
                mode: "either",
              }),
            );
            const task = getTaskByDescription(yield* progress.listTasks, description);
            return { exit, task };
          }).pipe(Effect.provide(Progress.Progress.Default)),
        ),
      ),
    );

    expect(Exit.isSuccess(result.exit)).toBeTrue();
    expect(result.task.status).toBe("done");
    expect(result.task.countDisplay).toBe("detailed");
    expect(result.task.units.total).toBe(3);
    expect(result.task.units.succeeded).toBe(2);
    expect(result.task.units.failed).toBe(1);
    expect(result.task.units.processed).toBe(3);
    expect(result.task.units.total).toBe(3);
  });

  test("all validate mode completes task after full accounting even when effect fails", async () => {
    const result = await Effect.runPromise(
      withStdio(
        Effect.scoped(
          Effect.gen(function* () {
            const progress = yield* Progress.Progress;
            const description = "all-validate-counters";
            const exit = yield* Effect.exit(
              Progress.all([Effect.succeed("ok-1"), Effect.fail("bad"), Effect.succeed("ok-2")], {
                description,
                mode: "validate",
              }),
            );
            const task = getTaskByDescription(yield* progress.listTasks, description);
            return { exit, task };
          }).pipe(Effect.provide(Progress.Progress.Default)),
        ),
      ),
    );

    expect(Exit.isFailure(result.exit)).toBeTrue();
    expect(result.task.status).toBe("done");
    expect(result.task.countDisplay).toBe("detailed");
    expect(result.task.units.total).toBe(3);
    expect(result.task.units.succeeded).toBe(2);
    expect(result.task.units.failed).toBe(1);
    expect(result.task.units.processed).toBe(3);
    expect(result.task.units.total).toBe(3);
  });

  test("forEach fail-fast does not account unresolved items", async () => {
    const result = await Effect.runPromise(
      withStdio(
        Effect.scoped(
          Effect.gen(function* () {
            const progress = yield* Progress.Progress;
            const description = "foreach-fail-fast-counters";
            const exit = yield* Effect.exit(
              Progress.forEach(
                [1, 2, 3],
                (item) => (item === 2 ? Effect.fail("bad-item") : Effect.succeed(item)),
                { description },
              ),
            );
            const task = getTaskByDescription(yield* progress.listTasks, description);
            return { exit, task };
          }).pipe(Effect.provide(Progress.Progress.Default)),
        ),
      ),
    );

    expect(Exit.isFailure(result.exit)).toBeTrue();
    expect(result.task.status).toBe("failed");
    expect(result.task.countDisplay).toBe("processedOnly");
    expect(result.task.units.total).toBe(3);
    expect(result.task.units.succeeded).toBe(1);
    expect(result.task.units.failed).toBe(1);
    expect(result.task.units.processed).toBe(2);
    expect(result.task.units.total).toBe(3);
  });
});
