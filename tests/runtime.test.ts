import { describe, expect, test } from "bun:test";
import { Effect, Option } from "effect";
import * as Progress from "../src";
import { createMockStdio } from "./helpers/mock-stdio";

const withStdio = <A, E, R>(effect: Effect.Effect<A, E, R>) => {
  const stdio = createMockStdio();
  return effect.pipe(Effect.provideService(Progress.ProgressStdio, stdio.service));
};

const withProgress = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.scoped(effect.pipe(Effect.provide(Progress.Progress.Default)));

const getTaskOrThrow = (
  task: Option.Option<Progress.TaskSnapshot>,
  label: string,
): Progress.TaskSnapshot => {
  if (Option.isNone(task)) {
    throw new Error(`Expected task "${label}" to exist`);
  }
  return task.value;
};

describe("transient propagation", () => {
  test("defaults root tasks to transient false", async () => {
    const root = await Effect.runPromise(
      withStdio(
        withProgress(
          Effect.gen(function* () {
            const progress = yield* Progress.Progress;
            const rootId = yield* progress.addTask({ description: "root" });
            return getTaskOrThrow(yield* progress.getTask(rootId), "root");
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

            const parent = getTaskOrThrow(yield* progress.getTask(parentId), "parent");
            const child = getTaskOrThrow(yield* progress.getTask(childId), "child");
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

            const parent = getTaskOrThrow(yield* progress.getTask(parentId), "parent");
            const child = getTaskOrThrow(yield* progress.getTask(childId), "child");
            return { parent, child };
          }),
        ),
      ),
    );

    expect(result.parent.transient).toBeFalse();
    expect(result.child.transient).toBeTrue();
  });

  test("updating parent transient propagates to descendants", async () => {
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
            });
            const grandchildId = yield* progress.addTask({
              description: "grandchild",
              parentId: childId,
            });

            yield* progress.updateTask(parentId, { transient: true });

            const parent = getTaskOrThrow(yield* progress.getTask(parentId), "parent");
            const child = getTaskOrThrow(yield* progress.getTask(childId), "child");
            const grandchild = getTaskOrThrow(yield* progress.getTask(grandchildId), "grandchild");

            return { parent, child, grandchild };
          }),
        ),
      ),
    );

    expect(result.parent.transient).toBeTrue();
    expect(result.child.transient).toBeTrue();
    expect(result.grandchild.transient).toBeTrue();
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
            return getTaskOrThrow(yield* progress.getTask(taskId), "root");
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

            const parent = getTaskOrThrow(yield* progress.getTask(parentId), "parent");
            const child = getTaskOrThrow(yield* progress.getTask(childId), "child");
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
            return getTaskOrThrow(yield* progress.getTask(taskId), "mode-change");
          }),
        ),
      ),
    );

    expect(task.countDisplay).toBe("processedOnly");
  });
});

describe("determinate task counters", () => {
  test("advance methods maintain succeeded/failed invariants", async () => {
    const task = await Effect.runPromise(
      withStdio(
        withProgress(
          Effect.gen(function* () {
            const progress = yield* Progress.Progress;
            const taskId = yield* progress.addTask({ description: "counts", total: 5 });

            yield* progress.incrementSucceeded(taskId, 2);
            yield* progress.incrementFailed(taskId, 1);

            return getTaskOrThrow(yield* progress.getTask(taskId), "counts");
          }),
        ),
      ),
    );

    expect(task.units._tag).toBe("DeterminateTaskUnits");
    if (task.units._tag !== "DeterminateTaskUnits") {
      throw new Error("expected determinate units");
    }

    expect(task.units.succeeded).toBe(2);
    expect(task.units.failed).toBe(1);
    expect(task.units.processed).toBe(3);
    expect(task.units.total).toBe(5);
  });

  test("updateTask clamps counts and recomputes processed", async () => {
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

            return getTaskOrThrow(yield* progress.getTask(taskId), "clamp");
          }),
        ),
      ),
    );

    expect(task.units._tag).toBe("DeterminateTaskUnits");
    if (task.units._tag !== "DeterminateTaskUnits") {
      throw new Error("expected determinate units");
    }

    expect(task.units.succeeded).toBe(3);
    expect(task.units.failed).toBe(2);
    expect(task.units.processed).toBe(5);
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

            return getTaskOrThrow(yield* progress.getTask(taskId), "complete");
          }),
        ),
      ),
    );

    expect(task.status).toBe("done");
    expect(task.units._tag).toBe("DeterminateTaskUnits");
    if (task.units._tag !== "DeterminateTaskUnits") {
      throw new Error("expected determinate units");
    }

    expect(task.units.succeeded).toBe(4);
    expect(task.units.failed).toBe(1);
    expect(task.units.processed).toBe(5);
    expect(task.units.total).toBe(5);
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

            return getTaskOrThrow(yield* progress.getTask(taskId), "fail");
          }),
        ),
      ),
    );

    expect(task.status).toBe("failed");
    expect(task.units._tag).toBe("DeterminateTaskUnits");
    if (task.units._tag !== "DeterminateTaskUnits") {
      throw new Error("expected determinate units");
    }

    expect(task.units.succeeded).toBe(1);
    expect(task.units.failed).toBe(1);
    expect(task.units.processed).toBe(2);
    expect(task.units.total).toBe(5);
  });
});
