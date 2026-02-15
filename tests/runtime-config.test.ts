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
    const program = Progress.withTask(
      { description: "runtime-config-context", transient: true },
      Effect.gen(function* () {
        const progress = yield* Progress.Progress;
        const rootId = yield* progress.addTask({
          description: "root",
        });
        const root = getTaskOrThrow(yield* progress.getTask(rootId), "root");
        return root;
      }),
    ).pipe(
      Effect.provideService(Progress.RendererConfig, {
        isTTY: false,
        renderIntervalMillis: 1000,
      }),
      Effect.provideService(Progress.ProgressBarConfig, {
        barWidth: 44,
        spinnerFrames: [".", "o", "O"],
        colors: {
          fill: { kind: "named", value: "magentaBright" },
        },
      }),
    );

    const root = await Effect.runPromise(program);

    expect(root.progressbar.barWidth).toBe(44);
    expect(root.progressbar.spinnerFrames).toEqual([".", "o", "O"]);
    expect(root.progressbar.colors.fill).toEqual({ kind: "named", value: "magentaBright" });
  });

  test("inherits parent override, applies child partial override, and keeps siblings isolated", async () => {
    const program = Progress.withTask(
      { description: "runtime-config-context", transient: true },
      Effect.gen(function* () {
        const progress = yield* Progress.Progress;
        const rootId = yield* progress.addTask({
          description: "root",
          progressbar: {
            barWidth: 40,
            spinnerFrames: ["R", "r"],
            colors: {
              fill: { kind: "named", value: "blueBright" },
            },
          },
        });

        const childId = yield* progress.addTask({
          description: "child",
          parentId: rootId,
          progressbar: {
            spinnerFrames: ["C"],
            colors: {
              spinner: { kind: "named", value: "yellowBright" },
            },
          },
        });

        const siblingId = yield* progress.addTask({
          description: "sibling",
          parentId: rootId,
          progressbar: {
            colors: {
              percent: { kind: "named", value: "cyanBright" },
            },
          },
        });

        const root = getTaskOrThrow(yield* progress.getTask(rootId), "root");
        const child = getTaskOrThrow(yield* progress.getTask(childId), "child");
        const sibling = getTaskOrThrow(yield* progress.getTask(siblingId), "sibling");
        return { root, child, sibling };
      }),
    ).pipe(
      Effect.provideService(Progress.RendererConfig, {
        isTTY: false,
        renderIntervalMillis: 1000,
      }),
      Effect.provideService(Progress.ProgressBarConfig, {
        barWidth: 32,
        spinnerFrames: ["-", "+"],
        colors: {
          spinner: { kind: "named", value: "whiteBright" },
        },
      }),
    );

    const { root, child, sibling } = await Effect.runPromise(program);

    expect(root.progressbar.barWidth).toBe(40);
    expect(root.progressbar.spinnerFrames).toEqual(["R", "r"]);
    expect(root.progressbar.colors.fill).toEqual({ kind: "named", value: "blueBright" });

    expect(child.progressbar.barWidth).toBe(40);
    expect(child.progressbar.spinnerFrames).toEqual(["C"]);
    expect(child.progressbar.colors.fill).toEqual({ kind: "named", value: "blueBright" });
    expect(child.progressbar.colors.spinner).toEqual({ kind: "named", value: "yellowBright" });

    expect(sibling.progressbar.barWidth).toBe(40);
    expect(sibling.progressbar.spinnerFrames).toEqual(["R", "r"]);
    expect(sibling.progressbar.colors.fill).toEqual({ kind: "named", value: "blueBright" });
    expect(sibling.progressbar.colors.percent).toEqual({
      kind: "named",
      value: "cyanBright",
      modifiers: ["bold"],
    });
    expect(sibling.progressbar.colors.spinner).toEqual({ kind: "named", value: "whiteBright" });
  });
});
