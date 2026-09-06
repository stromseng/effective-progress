import { describe, expect, test } from "bun:test";
import { Effect, Option } from "effect";
import * as Progress from "../../src";
import { createMockStdio } from "../helpers/mock-stdio";

const withStdio = <A, E, R>(effect: Effect.Effect<A, E, R>) => {
  const stdio = createMockStdio();
  return effect.pipe(Effect.provideService(Progress.ProgressStdio, stdio.service));
};

const withProgress = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.scoped(effect.pipe(Effect.provide(Progress.Progress.layer)));

const getTaskOrFail = (
  task: Option.Option<Progress.TaskSnapshot>,
  label: string,
): Progress.TaskSnapshot => {
  expect(Option.isSome(task), `Expected task "${label}" to exist`).toBeTrue();
  return Option.getOrThrow(task);
};

describe("transient propagation", () => {
  test("defaults root tasks to transient false", async () => {
    const root = await Effect.runPromise(
      withStdio(
        withProgress(
          Effect.gen(function* () {
            const progress = yield* Progress.Progress;
            const rootId = yield* progress.addTask({ description: "root" });
            return getTaskOrFail(yield* progress.getTask(rootId), "root");
          }),
        ),
      ),
    );

    expect(root.transient).toBeFalse();
  });

  test("children inherit parent transient=true even if child sets false", async () => {
    const result = await Effect.runPromise(
      withStdio(
        withProgress(
          Effect.gen(function* () {
            const progress = yield* Progress.Progress;
            const parentId = yield* progress.addTask({
              description: "parent",
              transient: true,
            });
            const childId = yield* progress.addTask({
              description: "child",
              parentId,
              transient: false,
            });

            const parent = getTaskOrFail(yield* progress.getTask(parentId), "parent");
            const child = getTaskOrFail(yield* progress.getTask(childId), "child");
            return { parent, child };
          }),
        ),
      ),
    );

    expect(result.parent.transient).toBeTrue();
    expect(result.child.transient).toBeTrue();
  });

  test("child can opt into transient when parent is non-transient", async () => {
    const result = await Effect.runPromise(
      withStdio(
        withProgress(
          Effect.gen(function* () {
            const progress = yield* Progress.Progress;
            const parentId = yield* progress.addTask({
              description: "parent",
              transient: false,
            });
            const childId = yield* progress.addTask({
              description: "child",
              parentId,
              transient: true,
            });

            const parent = getTaskOrFail(yield* progress.getTask(parentId), "parent");
            const child = getTaskOrFail(yield* progress.getTask(childId), "child");
            return { parent, child };
          }),
        ),
      ),
    );

    expect(result.parent.transient).toBeFalse();
    expect(result.child.transient).toBeTrue();
  });

  test("transient child is removed on completion even under non-transient parent", async () => {
    const result = await Effect.runPromise(
      withStdio(
        withProgress(
          Effect.gen(function* () {
            const progress = yield* Progress.Progress;
            const parentId = yield* progress.addTask({
              description: "parent",
              transient: false,
            });
            const childId = yield* progress.addTask({
              description: "child",
              parentId,
              transient: true,
              total: 1,
            });

            yield* progress.incrementSucceeded(childId, 1);
            yield* progress.completeTask(childId);

            const parent = yield* progress.getTask(parentId);
            const child = yield* progress.getTask(childId);

            return { parent, child };
          }),
        ),
      ),
    );

    expect(Option.isSome(result.parent)).toBeTrue();
    expect(Option.isNone(result.child)).toBeTrue();
  });
});

describe("count display", () => {
  test("defaults root tasks to detailed", async () => {
    const task = await Effect.runPromise(
      withStdio(
        withProgress(
          Effect.gen(function* () {
            const progress = yield* Progress.Progress;
            const taskId = yield* progress.addTask({ description: "root" });
            return getTaskOrFail(yield* progress.getTask(taskId), "root");
          }),
        ),
      ),
    );

    expect(task.countDisplay).toBe("detailed");
  });

  test("child tasks inherit parent count display", async () => {
    const result = await Effect.runPromise(
      withStdio(
        withProgress(
          Effect.gen(function* () {
            const progress = yield* Progress.Progress;
            const parentId = yield* progress.addTask({
              description: "parent",
              countDisplay: "processedOnly",
            });
            const childId = yield* progress.addTask({
              description: "child",
              parentId,
            });

            const parent = getTaskOrFail(yield* progress.getTask(parentId), "parent");
            const child = getTaskOrFail(yield* progress.getTask(childId), "child");
            return { parent, child };
          }),
        ),
      ),
    );

    expect(result.parent.countDisplay).toBe("processedOnly");
    expect(result.child.countDisplay).toBe("processedOnly");
  });

  test("updateTask can change count display mode", async () => {
    const task = await Effect.runPromise(
      withStdio(
        withProgress(
          Effect.gen(function* () {
            const progress = yield* Progress.Progress;
            const taskId = yield* progress.addTask({ description: "mode-change" });
            yield* progress.updateTask(taskId, { countDisplay: "processedOnly" });
            return getTaskOrFail(yield* progress.getTask(taskId), "mode-change");
          }),
        ),
      ),
    );

    expect(task.countDisplay).toBe("processedOnly");
  });
});

describe("determinate task counters", () => {
  test("advance methods preserve raw counts when processed exceeds total", async () => {
    const task = await Effect.runPromise(
      withStdio(
        withProgress(
          Effect.gen(function* () {
            const progress = yield* Progress.Progress;
            const taskId = yield* progress.addTask({ description: "counts", total: 5 });

            yield* progress.incrementSucceeded(taskId, 6);
            yield* progress.incrementFailed(taskId, 2);

            return getTaskOrFail(yield* progress.getTask(taskId), "counts");
          }),
        ),
      ),
    );

    expect(task.units.total).toBe(5);
    expect(task.units.succeeded).toBe(6);
    expect(task.units.failed).toBe(2);
    expect(task.units.processed).toBe(8);
    expect(task.units.total).toBe(5);
  });

  test("updateTask preserves overflow counts and recomputes processed", async () => {
    const task = await Effect.runPromise(
      withStdio(
        withProgress(
          Effect.gen(function* () {
            const progress = yield* Progress.Progress;
            const taskId = yield* progress.addTask({ description: "clamp", total: 5 });

            yield* progress.updateTask(taskId, {
              succeeded: 4,
              failed: 2,
            });

            return getTaskOrFail(yield* progress.getTask(taskId), "clamp");
          }),
        ),
      ),
    );

    expect(task.units.total).toBe(5);
    expect(task.units.succeeded).toBe(4);
    expect(task.units.failed).toBe(2);
    expect(task.units.processed).toBe(6);
    expect(task.units.total).toBe(5);
  });

  test("completeTask fills remaining work as success while preserving failures", async () => {
    const task = await Effect.runPromise(
      withStdio(
        withProgress(
          Effect.gen(function* () {
            const progress = yield* Progress.Progress;
            const taskId = yield* progress.addTask({ description: "complete", total: 5 });

            yield* progress.incrementFailed(taskId, 1);
            yield* progress.completeTask(taskId);

            return getTaskOrFail(yield* progress.getTask(taskId), "complete");
          }),
        ),
      ),
    );

    expect(task.status).toBe("done");
    expect(task.units.total).toBe(5);
    expect(task.units.succeeded).toBe(4);
    expect(task.units.failed).toBe(1);
    expect(task.units.processed).toBe(5);
    expect(task.units.total).toBe(5);
  });

  test("completeTask preserves overflowed determinate counts", async () => {
    const task = await Effect.runPromise(
      withStdio(
        withProgress(
          Effect.gen(function* () {
            const progress = yield* Progress.Progress;
            const taskId = yield* progress.addTask({ description: "overflow-complete", total: 5 });

            yield* progress.incrementSucceeded(taskId, 6);
            yield* progress.incrementFailed(taskId, 2);
            yield* progress.completeTask(taskId);

            return getTaskOrFail(yield* progress.getTask(taskId), "overflow-complete");
          }),
        ),
      ),
    );

    expect(task.status).toBe("done");
    expect(task.units.total).toBe(5);
    expect(task.units.succeeded).toBe(6);
    expect(task.units.failed).toBe(2);
    expect(task.units.processed).toBe(8);
  });

  test("updateTask can clear total and keep accumulated counts", async () => {
    const task = await Effect.runPromise(
      withStdio(
        withProgress(
          Effect.gen(function* () {
            const progress = yield* Progress.Progress;
            const taskId = yield* progress.addTask({ description: "switch-mode", total: 5 });

            yield* progress.incrementSucceeded(taskId, 2);
            yield* progress.updateTask(taskId, { total: undefined });
            yield* progress.incrementFailed(taskId, 1);

            return getTaskOrFail(yield* progress.getTask(taskId), "switch-mode");
          }),
        ),
      ),
    );

    expect(task.units.total).toBeUndefined();
    expect(task.units.succeeded).toBe(2);
    expect(task.units.failed).toBe(1);
    expect(task.units.processed).toBe(3);
  });

  test("completeTask finalizes unknown total as processed count", async () => {
    const task = await Effect.runPromise(
      withStdio(
        withProgress(
          Effect.gen(function* () {
            const progress = yield* Progress.Progress;
            const taskId = yield* progress.addTask({ description: "stream-complete" });

            yield* progress.incrementSucceeded(taskId, 2);
            yield* progress.incrementFailed(taskId, 1);
            yield* progress.completeTask(taskId);

            return getTaskOrFail(yield* progress.getTask(taskId), "stream-complete");
          }),
        ),
      ),
    );

    expect(task.status).toBe("done");
    expect(task.units.total).toBe(3);
    expect(task.units.succeeded).toBe(2);
    expect(task.units.failed).toBe(1);
    expect(task.units.processed).toBe(3);
  });

  test("failTask preserves partial counts", async () => {
    const task = await Effect.runPromise(
      withStdio(
        withProgress(
          Effect.gen(function* () {
            const progress = yield* Progress.Progress;
            const taskId = yield* progress.addTask({ description: "fail", total: 5 });

            yield* progress.incrementSucceeded(taskId, 1);
            yield* progress.incrementFailed(taskId, 1);
            yield* progress.failTask(taskId);

            return getTaskOrFail(yield* progress.getTask(taskId), "fail");
          }),
        ),
      ),
    );

    expect(task.status).toBe("failed");
    expect(task.units.total).toBe(5);
    expect(task.units.succeeded).toBe(1);
    expect(task.units.failed).toBe(1);
    expect(task.units.processed).toBe(2);
    expect(task.units.total).toBe(5);
  });

  test("advance methods still count indeterminate tasks", async () => {
    const task = await Effect.runPromise(
      withStdio(
        withProgress(
          Effect.gen(function* () {
            const progress = yield* Progress.Progress;
            const taskId = yield* progress.addTask({ description: "stream" });

            yield* progress.incrementSucceeded(taskId, 2);
            yield* progress.incrementFailed(taskId, 1);

            return getTaskOrFail(yield* progress.getTask(taskId), "stream");
          }),
        ),
      ),
    );

    expect(task.units.total).toBeUndefined();
    expect(task.units.succeeded).toBe(2);
    expect(task.units.failed).toBe(1);
    expect(task.units.processed).toBe(3);
  });

  test("accepts zero totals", async () => {
    const task = await Effect.runPromise(
      withStdio(
        withProgress(
          Effect.gen(function* () {
            const progress = yield* Progress.Progress;
            const taskId = yield* progress.addTask({ description: "zero-total", total: 0 });
            return getTaskOrFail(yield* progress.getTask(taskId), "zero-total");
          }),
        ),
      ),
    );

    expect(task.units.total).toBe(0);
    expect(task.units.processed).toBe(0);
  });

  test("negative totals clear the total on addTask", async () => {
    const task = await Effect.runPromise(
      withStdio(
        withProgress(
          Effect.gen(function* () {
            const progress = yield* Progress.Progress;
            const taskId = yield* progress.addTask({ description: "negative-total", total: -5 });
            return getTaskOrFail(yield* progress.getTask(taskId), "negative-total");
          }),
        ),
      ),
    );

    expect(task.units.total).toBeUndefined();
    expect(task.units.processed).toBe(0);
  });

  test("negative totals clear the total on updateTask", async () => {
    const task = await Effect.runPromise(
      withStdio(
        withProgress(
          Effect.gen(function* () {
            const progress = yield* Progress.Progress;
            const taskId = yield* progress.addTask({ description: "negative-update", total: 5 });
            yield* progress.updateTask(taskId, { total: -5 });
            return getTaskOrFail(yield* progress.getTask(taskId), "negative-update");
          }),
        ),
      ),
    );

    expect(task.units.total).toBeUndefined();
    expect(task.units.processed).toBe(0);
  });
});
