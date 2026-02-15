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
        colors: {
          fill: { kind: "named", value: "magentaBright" },
        },
      }),
    );

    const root = await Effect.runPromise(program);

    expect(root.config.barWidth).toBe(44);
    expect(root.config.spinnerFrames).toEqual([".", "o", "O"]);
    expect(root.config.colors.fill).toEqual({ kind: "named", value: "magentaBright" });
  });

  test("inherits parent override, applies child partial override, and keeps siblings isolated", async () => {
    const program = Progress.withTask(
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
        colors: {
          spinner: { kind: "named", value: "whiteBright" },
        },
      }),
    );

    const { root, child, sibling } = await Effect.runPromise(program);

    expect(root.config.barWidth).toBe(40);
    expect(root.config.spinnerFrames).toEqual(["R", "r"]);
    expect(root.config.colors.fill).toEqual({ kind: "named", value: "blueBright" });

    expect(child.config.barWidth).toBe(40);
    expect(child.config.spinnerFrames).toEqual(["C"]);
    expect(child.config.colors.fill).toEqual({ kind: "named", value: "blueBright" });
    expect(child.config.colors.spinner).toEqual({ kind: "named", value: "yellowBright" });

    expect(sibling.config.barWidth).toBe(40);
    expect(sibling.config.spinnerFrames).toEqual(["R", "r"]);
    expect(sibling.config.colors.fill).toEqual({ kind: "named", value: "blueBright" });
    expect(sibling.config.colors.percent).toEqual({
      kind: "named",
      value: "cyanBright",
      modifiers: ["bold"],
    });
    expect(sibling.config.colors.spinner).toEqual({ kind: "named", value: "whiteBright" });
  });
});
