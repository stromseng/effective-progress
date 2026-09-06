import { describe, expect, test } from "bun:test";
import { Console, Effect, Exit, Logger, Option, Result } from "effect";
import { pipe } from "effect/Function";
import * as Progress from "../src";
import { Renderer } from "../src/renderer/renderer";
import { createMockStdio } from "./helpers/mock-stdio";

const withLogSpy = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const outer = yield* Console.Console;
    const logs: Array<ReadonlyArray<unknown>> = [];

    const consoleSpy: Console.Console = {
      ...outer,
      log: (...args) => {
        logs.push(args);
      },
    };

    const result = yield* Effect.provideService(effect, Console.Console, consoleSpy);
    return { result, logs };
  });

const withStdio = <A, E, R>(effect: Effect.Effect<A, E, R>) => {
  const stdio = createMockStdio();
  return effect.pipe(Effect.provideService(Progress.ProgressStdio, stdio.service));
};

const withLoggerSpy = <A, E, R>(effect: Effect.Effect<A, E, R>) => {
  const logs: Array<Logger.Options<unknown>> = [];
  const logger = Logger.make<unknown, void>((options) => {
    logs.push(options);
  });

  return Effect.map(Effect.provide(effect, Logger.layer([logger])), (result) => ({ result, logs }));
};

const getTaskByDescription = (
  tasks: ReadonlyArray<Progress.TaskSnapshot>,
  description: string,
): Progress.TaskSnapshot => {
  const task = tasks.find((candidate) => candidate.description === description);
  expect(task, `Task "${description}" not found`).toBeDefined();
  return task!;
};

describe("Progress task scopes", () => {
  test("plain logs are not swallowed when no tasks are created", async () => {
    const message = "plain-log-no-task";
    const { logs } = await Effect.runPromise(withLogSpy(withStdio(Console.log(message))));

    expect(logs.some((args) => args[0] === message)).toBeTrue();
  });

  test("nested task reuses the outer service", async () => {
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

  test("isolated nested Progress layer does not inherit the outer parent", async () => {
    const inner = Effect.gen(function* () {
      const progress = yield* Progress.Progress;
      yield* progress.task(Effect.void, {
        description: "isolated-inner",
        transient: false,
      });
      return getTaskByDescription(yield* progress.listTasks, "isolated-inner");
    });

    const outer = Effect.gen(function* () {
      const isolatedInner = Effect.scoped(
        Effect.provide(inner, Progress.Progress.layer, { local: true }),
      );
      return yield* Progress.task(isolatedInner, { description: "outer", transient: false });
    });

    const innerTask = await Effect.runPromise(
      withStdio(Effect.provideService(outer, Renderer, { start: Effect.void })),
    );

    expect(innerTask.parentId).toBeNull();
  });

  test("manual task delegates Console.log to the outer console and provides Task context", async () => {
    const capturedMessage = "manual-captured";

    const { result, logs } = await Effect.runPromise(
      withLogSpy(
        withStdio(
          Progress.task(
            Effect.gen(function* () {
              const progress = yield* Progress.Progress;

              const taskIdFromContext = yield* progress.task(
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

  test("task preserves Effect v4 loggers", async () => {
    const { logs } = await Effect.runPromise(
      withLoggerSpy(
        withStdio(
          Progress.task(Effect.logInfo("effect-log"), {
            description: "logger-task",
            transient: true,
          }),
        ),
      ),
    );
    expect(logs).toHaveLength(1);
    expect(logs[0]?.message).toEqual(["effect-log"]);
    expect(logs[0]?.logLevel).toBe("Info");
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
        const outer = yield* Console.Console;
        const consoleSpy: Console.Console = {
          ...outer,
          dir: (item, nextOptions) => {
            captured = { item, options: nextOptions };
          },
        };

        return yield* Effect.provideService(
          withStdio(
            Progress.task(
              Effect.gen(function* () {
                yield* Console.dir(payload, options);
                return true;
              }),
              { description: "dir-replay" },
            ),
          ),
          Console.Console,
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
      logs.some((args) => args[0] === `${capturedPrefix}:a` || args[0] === `${capturedPrefix}:b`),
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
          }).pipe(Effect.provide(Progress.Progress.layer)),
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
          }).pipe(Effect.provide(Progress.Progress.layer)),
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
          }).pipe(Effect.provide(Progress.Progress.layer)),
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
          }).pipe(Effect.provide(Progress.Progress.layer)),
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
          }).pipe(Effect.provide(Progress.Progress.layer)),
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

  test("all result mode completes with mixed succeeded/failed counters", async () => {
    const result = await Effect.runPromise(
      withStdio(
        Effect.scoped(
          Effect.gen(function* () {
            const progress = yield* Progress.Progress;
            const description = "all-result-counters";
            const exit = yield* Effect.exit(
              Progress.all([Effect.succeed("ok-1"), Effect.fail("bad"), Effect.succeed("ok-2")], {
                description,
                mode: "result",
              }),
            );
            const task = getTaskByDescription(yield* progress.listTasks, description);
            return { exit, task };
          }).pipe(Effect.provide(Progress.Progress.layer)),
        ),
      ),
    );

    expect(Exit.isSuccess(result.exit)).toBeTrue();
    if (Exit.isSuccess(result.exit)) {
      expect(Result.isSuccess(result.exit.value[0])).toBeTrue();
      expect(Result.isFailure(result.exit.value[1])).toBeTrue();
      expect(Result.isSuccess(result.exit.value[2])).toBeTrue();
    }
    expect(result.task.status).toBe("done");
    expect(result.task.countDisplay).toBe("detailed");
    expect(result.task.units.total).toBe(3);
    expect(result.task.units.succeeded).toBe(2);
    expect(result.task.units.failed).toBe(1);
    expect(result.task.units.processed).toBe(3);
    expect(result.task.units.total).toBe(3);
  });

  test("all result mode completes after accounting for all failures", async () => {
    const result = await Effect.runPromise(
      withStdio(
        Effect.scoped(
          Effect.gen(function* () {
            const progress = yield* Progress.Progress;
            const description = "all-result-failure-counters";
            const exit = yield* Effect.exit(
              Progress.all([Effect.fail("bad-1"), Effect.fail("bad-2")], {
                description,
                mode: "result",
              }),
            );
            const task = getTaskByDescription(yield* progress.listTasks, description);
            return { exit, task };
          }).pipe(Effect.provide(Progress.Progress.layer)),
        ),
      ),
    );

    expect(Exit.isSuccess(result.exit)).toBeTrue();
    expect(result.task.status).toBe("done");
    expect(result.task.countDisplay).toBe("detailed");
    expect(result.task.units.total).toBe(2);
    expect(result.task.units.succeeded).toBe(0);
    expect(result.task.units.failed).toBe(2);
    expect(result.task.units.processed).toBe(2);
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
          }).pipe(Effect.provide(Progress.Progress.layer)),
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

  test("typed callback preserves explicit failure when the effect succeeds", async () => {
    const result = await Effect.runPromise(
      withStdio(
        Effect.scoped(
          Effect.gen(function* () {
            const progress = yield* Progress.Progress;
            const description = "typed-callback-explicit-fail";
            const value = yield* Progress.task(
              (handle) =>
                Effect.gen(function* () {
                  yield* handle.fail;
                  return "ok";
                }),
              {
                description,
                transient: false,
                metadata: { mode: "fail" as const },
              },
            );
            const task = getTaskByDescription(yield* progress.listTasks, description);
            return { value, task };
          }).pipe(Effect.provide(Progress.Progress.layer)),
        ),
      ),
    );

    expect(result.value).toBe("ok");
    expect(result.task.status).toBe("failed");
  });

  test("typed callback preserves explicit completion when the effect fails", async () => {
    const result = await Effect.runPromise(
      withStdio(
        Effect.scoped(
          Effect.gen(function* () {
            const progress = yield* Progress.Progress;
            const description = "typed-callback-explicit-complete";
            const exit = yield* Effect.exit(
              Progress.task(
                (handle) =>
                  Effect.gen(function* () {
                    yield* handle.complete;
                    return yield* Effect.fail("boom");
                  }),
                {
                  description,
                  transient: false,
                  metadata: { mode: "complete" as const },
                },
              ),
            );
            const task = getTaskByDescription(yield* progress.listTasks, description);
            return { exit, task };
          }).pipe(Effect.provide(Progress.Progress.layer)),
        ),
      ),
    );

    expect(Exit.isFailure(result.exit)).toBeTrue();
    expect(result.task.status).toBe("done");
  });

  test("explicit finalization is terminal once a task leaves running", async () => {
    const result = await Effect.runPromise(
      withStdio(
        Effect.scoped(
          Effect.gen(function* () {
            const progress = yield* Progress.Progress;

            const completedId = yield* progress.addTask({
              description: "terminal-complete",
              transient: false,
            });
            yield* progress.completeTask(completedId);
            yield* progress.failTask(completedId);

            const failedId = yield* progress.addTask({
              description: "terminal-fail",
              transient: false,
            });
            yield* progress.failTask(failedId);
            yield* progress.completeTask(failedId);

            return {
              completed: getTaskByDescription(yield* progress.listTasks, "terminal-complete"),
              failed: getTaskByDescription(yield* progress.listTasks, "terminal-fail"),
            };
          }).pipe(Effect.provide(Progress.Progress.layer)),
        ),
      ),
    );

    expect(result.completed.status).toBe("done");
    expect(result.failed.status).toBe("failed");
  });
});
