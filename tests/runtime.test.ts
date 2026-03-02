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

  test("children inherit parent transient=false even if child sets true", async () => {
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
    expect(result.child.transient).toBeFalse();
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
});
