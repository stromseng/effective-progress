import { describe, expect, test } from "bun:test";
import { Deferred, Effect, Exit, Fiber } from "effect";
import * as Progress from "../../src";
import { Renderer } from "../../src/renderer/renderer";

const withProgress = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.provide(Progress.Progress.layer),
    Effect.provideService(Renderer, { start: Effect.void }),
    Effect.scoped,
  );

describe("task exit finalization", () => {
  test("concurrent handle metadata updates retain every increment without changing progress", async () => {
    const result = await Effect.runPromise(
      withProgress(
        Progress.task(
          (handle) =>
            Effect.gen(function* () {
              yield* Effect.forEach(
                Array.from({ length: 200 }),
                () => handle.updateMetadata((value) => value + 1),
                { concurrency: "unbounded" },
              );
              return { metadata: yield* handle.getMetadata, snapshot: yield* handle.getSnapshot };
            }),
          { description: "metadata updates", metadata: 0, total: 10 },
        ),
      ),
    );
    expect(result.metadata).toBe(200);
    expect(result.snapshot.units.processed).toBe(0);
    expect(result.snapshot.progressSamples).toHaveLength(1);
  });

  test("finalizes a callback that throws before returning an Effect", async () => {
    const defect = new Error("callback construction failed");
    const { exit, tasks } = await Effect.runPromise(
      withProgress(
        Effect.gen(function* () {
          const progress = yield* Progress.Progress;
          const exit = yield* Effect.exit(
            Progress.task(
              (): Effect.Effect<void> => {
                throw defect;
              },
              {
                description: "callback",
              },
            ),
          );
          return { exit, tasks: yield* progress.listTasks };
        }),
      ),
    );
    expect(exit).toEqual(Exit.die(defect));
    expect(tasks[0]?.status).toBe("failed");
  });

  test.each([
    ["default", 1, "failed"],
    ["result", 1, "done"],
    ["result", 2, "failed"],
  ] as const)("preserves defects in %s mode with %i units", async (mode, total, status) => {
    const defect = new Error("work failed");
    const { exit, tasks } = await Effect.runPromise(
      withProgress(
        Effect.gen(function* () {
          const progress = yield* Progress.Progress;
          const exit = yield* Effect.exit(
            Progress.all(total === 1 ? [Effect.die(defect)] : [Effect.die(defect), Effect.void], {
              description: "defect",
              mode,
            }),
          );
          return { exit, tasks: yield* progress.listTasks };
        }),
      ),
    );
    expect(exit).toEqual(Exit.die(defect));
    expect(tasks[0]?.status).toBe(status);
    expect(tasks[0]?.units).toEqual({ succeeded: 0, failed: 1, processed: 1, total });
  });

  test("interruption finalizes the parent without counting interrupted work", async () => {
    const tasks = await Effect.runPromise(
      withProgress(
        Effect.gen(function* () {
          const progress = yield* Progress.Progress;
          const started = yield* Deferred.make<void>();
          const fiber = yield* Effect.forkChild(
            Progress.all(
              [Deferred.succeed(started, undefined).pipe(Effect.andThen(Effect.never))],
              { description: "interrupted", mode: "result" },
            ),
          );
          yield* Deferred.await(started);
          yield* Fiber.interrupt(fiber);
          return yield* progress.listTasks;
        }),
      ),
    );
    expect(tasks[0]?.status).toBe("failed");
    expect(tasks[0]?.units).toEqual({ succeeded: 0, failed: 0, processed: 0, total: 1 });
  });
});
