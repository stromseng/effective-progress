import { describe, expect, test } from "bun:test";
import { Effect, Option } from "effect";
import * as Progress from "../src";
import type { TaskSnapshot } from "../src/types";

const getTaskOrThrow = (taskOption: Option.Option<TaskSnapshot>, label: string): TaskSnapshot => {
  if (Option.isNone(taskOption)) {
    throw new Error(`Missing task snapshot for ${label}`);
  }
  return taskOption.value;
};

describe("task progressbar inheritance", () => {
  test("root task inherits global progressbar config", async () => {
    const program = Progress.task(
      Effect.gen(function* () {
        const progress = yield* Progress.Progress;
        const rootId = yield* progress.addTask({
          description: "root",
        });
        const root = getTaskOrThrow(yield* progress.getTask(rootId), "root");
        return root;
      }),
      { description: "runtime-config-context", transient: true },
    ).pipe(
      Effect.provideService(Progress.RendererConfig, {
        renderIntervalMillis: 1000,
      }),
      Effect.provideService(Progress.ProgressTerminal, {
        isTTY: Effect.succeed(false),
        stderrRows: Effect.sync(() => undefined),
        stderrColumns: Effect.sync(() => undefined),
        writeStderr: () => Effect.void,
        withRawInputCapture: (innerEffect) => innerEffect,
      } satisfies Progress.ProgressTerminalService),
      Effect.provideService(Progress.ProgressBarConfig, {
        barWidth: 44,
        spinnerFrames: [".", "o", "O"],
      }),
    );

    const root = await Effect.runPromise(program);

    expect(root.config.barWidth).toBe(44);
    expect(root.config.spinnerFrames).toEqual([".", "o", "O"]);
  });

  test("inherits parent override, applies child partial override, and keeps siblings isolated", async () => {
    const program = Progress.task(
      Effect.gen(function* () {
        const progress = yield* Progress.Progress;
        const rootId = yield* progress.addTask({
          description: "root",
          progressbar: {
            barWidth: 40,
            spinnerFrames: ["R", "r"],
          },
        });

        const childId = yield* progress.addTask({
          description: "child",
          parentId: rootId,
          progressbar: {
            spinnerFrames: ["C"],
          },
        });

        const siblingId = yield* progress.addTask({
          description: "sibling",
          parentId: rootId,
        });

        const root = getTaskOrThrow(yield* progress.getTask(rootId), "root");
        const child = getTaskOrThrow(yield* progress.getTask(childId), "child");
        const sibling = getTaskOrThrow(yield* progress.getTask(siblingId), "sibling");
        return { root, child, sibling };
      }),
      { description: "runtime-config-context", transient: true },
    ).pipe(
      Effect.provideService(Progress.RendererConfig, {
        renderIntervalMillis: 1000,
      }),
      Effect.provideService(Progress.ProgressTerminal, {
        isTTY: Effect.succeed(false),
        stderrRows: Effect.sync(() => undefined),
        stderrColumns: Effect.sync(() => undefined),
        writeStderr: () => Effect.void,
        withRawInputCapture: (innerEffect) => innerEffect,
      } satisfies Progress.ProgressTerminalService),
      Effect.provideService(Progress.ProgressBarConfig, {
        barWidth: 32,
        spinnerFrames: ["-", "+"],
      }),
    );

    const { root, child, sibling } = await Effect.runPromise(program);

    expect(root.config.barWidth).toBe(40);
    expect(root.config.spinnerFrames).toEqual(["R", "r"]);

    expect(child.config.barWidth).toBe(40);
    expect(child.config.spinnerFrames).toEqual(["C"]);

    expect(sibling.config.barWidth).toBe(40);
    expect(sibling.config.spinnerFrames).toEqual(["R", "r"]);
  });
});

describe("transient propagation", () => {
  const withProgressRuntime = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.scoped(
      effect.pipe(
        Effect.provideService(Progress.RendererConfig, {
          renderIntervalMillis: 1000,
        }),
        Effect.provideService(Progress.ProgressTerminal, {
          isTTY: Effect.succeed(false),
          stderrRows: Effect.sync(() => undefined),
          stderrColumns: Effect.sync(() => undefined),
          writeStderr: () => Effect.void,
          withRawInputCapture: (innerEffect) => innerEffect,
        } satisfies Progress.ProgressTerminalService),
        Effect.provide(Progress.Progress.Default),
      ),
    );

  test("defaults root tasks to transient false", async () => {
    const program = withProgressRuntime(
      Effect.gen(function* () {
        const progress = yield* Progress.Progress;
        const rootId = yield* progress.addTask({ description: "root" });
        return getTaskOrThrow(yield* progress.getTask(rootId), "root");
      }),
    );

    const root = await Effect.runPromise(program);
    expect(root.transient).toBeFalse();
  });

  test("children inherit parent transient=true even if child sets false", async () => {
    const program = withProgressRuntime(
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
    );

    const { parent, child } = await Effect.runPromise(program);
    expect(parent.transient).toBeTrue();
    expect(child.transient).toBeTrue();
  });

  test("children inherit parent transient=false even if child sets true", async () => {
    const program = withProgressRuntime(
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
    );

    const { parent, child } = await Effect.runPromise(program);
    expect(parent.transient).toBeFalse();
    expect(child.transient).toBeFalse();
  });

  test("updating parent transient propagates to descendants", async () => {
    const program = withProgressRuntime(
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
    );

    const { parent, child, grandchild } = await Effect.runPromise(program);
    expect(parent.transient).toBeTrue();
    expect(child.transient).toBeTrue();
    expect(grandchild.transient).toBeTrue();
  });
});
