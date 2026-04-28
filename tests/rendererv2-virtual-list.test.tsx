import { describe, expect, test } from "bun:test";
import { renderToString } from "ink";
import { createElement } from "react";
import stripAnsi from "strip-ansi";
import * as Progress from "../src";
import { NowProvider } from "../src/renderer/context/now-context";
import { SpinnerProvider } from "../src/renderer/context/spinner-context";
import { ProgressRenderer } from "../src/renderer/public-api";
import type { TaskRowModel } from "../src/renderer/store/types";

const deriveRow = (task: Progress.TaskSnapshot): TaskRowModel => ({
  task,
  tree: {
    depth: 0,
    hasChildren: false,
    hasNextSibling: false,
    ancestorHasNextSibling: [],
  },
  derived: {
    treePrefix: "",
    treePrefixWidth: 0,
    descriptionWidth: task.description.length,
    treePrefixedDescriptionWidth: task.description.length,
    hasRenderableProgress: task.units.total !== undefined || task.units.processed > 0,
    isDeterminate: task.units.total !== undefined,
  },
});

const makeTask = (id: number): Progress.TaskSnapshot =>
  Progress.TaskSnapshot({
    id: Progress.TaskId(id),
    parentId: null,
    description: `task-${id}`,
    status: "done",
    countDisplay: "processedOnly",
    transient: false,
    units: {
      succeeded: 1,
      failed: 0,
      processed: 1,
      total: 1,
    },
    startedAt: 0,
    completedAt: 1_000,
    progressSamples: [
      { timestamp: 0, processed: 0 },
      { timestamp: 1_000, processed: 1 },
    ],
    metadata: undefined,
  });

const renderRows = (rows: ReadonlyArray<TaskRowModel>): string =>
  stripAnsi(
    renderToString(
      createElement(NowProvider, {
        active: false,
        nowOverride: 0,
        children: createElement(SpinnerProvider, {
          active: false,
          tickOverride: 0,
          children: createElement(ProgressRenderer, {
            rows,
            columns: new Map(),
          }),
        }),
      }),
    ),
  ).trimEnd();

describe("rendererv2 row rendering", () => {
  test("renders all rows directly without virtual scrolling", () => {
    const rows = Array.from({ length: 12 }, (_, index) => deriveRow(makeTask(index + 1)));
    const output = renderRows(rows);

    expect(output).toContain("task-1");
    expect(output).toContain("task-6");
    expect(output).toContain("task-12");
    expect(output.split("\n").length).toBe(12);
  });
});
