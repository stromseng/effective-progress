import { describe, expect, test } from "bun:test";
import { renderToString } from "ink";
import { createElement } from "react";
import stripAnsi from "strip-ansi";
import * as Progress from "../src";
import { createDescriptionColumn } from "../src/rendererv2/columns/description-column";
import { NowProvider } from "../src/rendererv2/context/now-context";
import { CreateProgressRenderer } from "../src/rendererv2/public-api";
import type { TaskRowModel } from "../src/rendererv2/store/types";

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
  });

const renderDescriptionList = (
  rows: ReadonlyArray<TaskRowModel>,
  terminalRows?: number,
): string => {
  const Renderer = CreateProgressRenderer([
    createDescriptionColumn({
      minWidth: 1,
      sticky: false,
    }),
  ]);

  return stripAnsi(
    renderToString(
      createElement(NowProvider, {
        active: false,
        nowOverride: 0,
        children: createElement(Renderer, {
          rows,
          terminalColumns: 20,
          terminalRows,
        }),
      }),
      { columns: 20 },
    ),
  ).trimEnd();
};

describe("rendererv2 virtual list", () => {
  test("keeps all rows visible when terminal row count is unavailable", () => {
    const rows = Array.from({ length: 12 }, (_, index) => deriveRow(makeTask(index + 1)));
    const output = renderDescriptionList(rows);

    expect(output).toContain("task-1");
    expect(output).toContain("task-12");
  });

  test("shows the bottom of the list when rows exceed the terminal height", () => {
    const rows = Array.from({ length: 12 }, (_, index) => deriveRow(makeTask(index + 1)));
    const output = renderDescriptionList(rows, 5);

    expect(output.split("\n")).toEqual(["  ▲ 9 more", "✓ task-10", "✓ task-11", "✓ task-12"]);
  });
});
