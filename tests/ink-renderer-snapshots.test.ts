import { describe, expect, test } from "bun:test";
import { Box, renderToString } from "ink";
import { createElement } from "react";
import stripAnsi from "strip-ansi";
import * as Progress from "../src";
import { RootColumn } from "../src/ink-renderer/columns/root-column";
import { toRenderSnapshot } from "../src/ink-renderer/store/render-snapshot";

const makeTask = (
  id: number,
  overrides: Partial<Progress.TaskSnapshot> & {
    units?: Progress.TaskSnapshot["units"];
  },
): Progress.TaskSnapshot =>
  new Progress.TaskSnapshot({
    id: Progress.TaskId(id),
    parentId: null,
    description: `task-${id}`,
    status: "running",
    countDisplay: "detailed",
    transient: false,
    units: overrides.units ?? {
      succeeded: 0,
      failed: 0,
      processed: 0,
      total: 1,
    },
    startedAt: 0,
    completedAt: null,
    ...overrides,
  });

const renderSnapshot = (
  tasks: ReadonlyArray<Progress.TaskSnapshot>,
  renderOrder: ReadonlyArray<{ readonly id: Progress.TaskId; readonly depth: number }>,
  options: {
    readonly now: number;
    readonly tick: number;
    readonly columns: number;
  },
): string => {
  const snapshot = toRenderSnapshot({
    tasks: new Map(tasks.map((task) => [task.id, task])),
    renderOrder,
  });

  return stripAnsi(
    renderToString(
      createElement(
        Box,
        { flexDirection: "row" },
        RootColumn(snapshot.rows, options.now, options.tick, options.columns, new Map()).render(),
      ),
      { columns: options.columns },
    ),
  ).trimEnd();
};

const renderSnapshotsAtWidths = (
  tasks: ReadonlyArray<Progress.TaskSnapshot>,
  renderOrder: ReadonlyArray<{ readonly id: Progress.TaskId; readonly depth: number }>,
  options: {
    readonly now: number;
    readonly tick: number;
    readonly widths: ReadonlyArray<number>;
  },
): string =>
  options.widths
    .map((columns) =>
      [
        `[${columns} columns]`,
        renderSnapshot(tasks, renderOrder, { now: options.now, tick: options.tick, columns }),
      ].join("\n"),
    )
    .join("\n\n");

describe("Ink renderer snapshots", () => {
  test("renders a stable matrix of task states", () => {
    const tasks = [
      makeTask(1, {
        description: "download-artifacts",
        startedAt: 10_000,
        units: {
          succeeded: 4,
          failed: 0,
          processed: 4,
          total: 12,
        },
      }),
      makeTask(2, {
        description: "compile",
        status: "done",
        startedAt: 0,
        completedAt: 25_000,
        units: {
          succeeded: 5,
          failed: 0,
          processed: 5,
          total: 5,
        },
      }),
      makeTask(3, {
        description: "unit-tests",
        status: "done",
        startedAt: 0,
        completedAt: 35_000,
        units: {
          succeeded: 6,
          failed: 2,
          processed: 8,
          total: 8,
        },
      }),
      makeTask(4, {
        description: "lint",
        status: "failed",
        startedAt: 5_000,
        completedAt: 17_000,
        units: {
          succeeded: 1,
          failed: 3,
          processed: 4,
          total: 10,
        },
      }),
      makeTask(5, {
        description: "stream-records",
        countDisplay: "processedOnly",
        startedAt: 20_000,
        units: {
          succeeded: 7,
          failed: 1,
          processed: 8,
        },
      }),
      makeTask(6, {
        description: "overflow-counts",
        status: "done",
        startedAt: 0,
        completedAt: 9_000,
        units: {
          succeeded: 6,
          failed: 2,
          processed: 8,
          total: 5,
        },
      }),
      makeTask(7, {
        description: "zero-total",
        status: "done",
        countDisplay: "processedOnly",
        startedAt: 0,
        completedAt: 5_000,
        units: {
          succeeded: 0,
          failed: 0,
          processed: 0,
          total: 0,
        },
      }),
      makeTask(8, {
        description: "ephemeral-hidden",
        status: "done",
        transient: true,
        startedAt: 0,
        completedAt: 1_000,
        units: {
          succeeded: 1,
          failed: 0,
          processed: 1,
          total: 1,
        },
      }),
    ];

    expect(
      renderSnapshotsAtWidths(
        tasks,
        tasks.map((task) => ({ id: task.id, depth: 0 })),
        {
          now: 40_000,
          tick: 0,
          widths: [120, 72, 36],
        },
      ),
    ).toMatchSnapshot();
  });

  test("renders nested tasks with stable tree connectors", () => {
    const tasks = [
      makeTask(21, {
        description: "pipeline",
        startedAt: 0,
        units: {
          succeeded: 1,
          failed: 0,
          processed: 1,
          total: 3,
        },
      }),
      makeTask(22, {
        parentId: Progress.TaskId(21),
        description: "parse-config",
        status: "done",
        startedAt: 0,
        completedAt: 3_000,
        units: {
          succeeded: 1,
          failed: 0,
          processed: 1,
          total: 1,
        },
      }),
      makeTask(23, {
        parentId: Progress.TaskId(21),
        description: "build-assets",
        startedAt: 2_000,
        units: {
          succeeded: 2,
          failed: 0,
          processed: 2,
          total: 4,
        },
      }),
      makeTask(24, {
        parentId: Progress.TaskId(23),
        description: "compile",
        status: "done",
        startedAt: 2_000,
        completedAt: 8_000,
        units: {
          succeeded: 2,
          failed: 0,
          processed: 2,
          total: 2,
        },
      }),
      makeTask(25, {
        parentId: Progress.TaskId(23),
        description: "test",
        status: "failed",
        startedAt: 4_000,
        completedAt: 14_000,
        units: {
          succeeded: 3,
          failed: 1,
          processed: 4,
          total: 6,
        },
      }),
      makeTask(26, {
        parentId: Progress.TaskId(21),
        description: "deploy",
        countDisplay: "processedOnly",
        startedAt: 12_000,
        units: {
          succeeded: 4,
          failed: 0,
          processed: 4,
        },
      }),
      makeTask(27, {
        description: "cleanup",
        status: "done",
        startedAt: 0,
        completedAt: 16_000,
        units: {
          succeeded: 1,
          failed: 0,
          processed: 1,
          total: 1,
        },
      }),
    ];

    expect(
      renderSnapshotsAtWidths(
        tasks,
        [
          { id: Progress.TaskId(21), depth: 0 },
          { id: Progress.TaskId(22), depth: 1 },
          { id: Progress.TaskId(23), depth: 1 },
          { id: Progress.TaskId(24), depth: 2 },
          { id: Progress.TaskId(25), depth: 2 },
          { id: Progress.TaskId(26), depth: 1 },
          { id: Progress.TaskId(27), depth: 0 },
        ],
        {
          now: 18_000,
          tick: 2,
          widths: [120, 72, 36],
        },
      ),
    ).toMatchSnapshot();
  });
});
