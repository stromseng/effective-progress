import { describe, expect, test } from "bun:test";
import { renderToString } from "ink";
import { createElement } from "react";
import stripAnsi from "strip-ansi";
import * as Progress from "../src";
import type { TaskColumnDef } from "../src/types";
import { NowProvider } from "../src/renderer/context/now-context";
import { ProgressRenderer } from "../src/renderer/public-api";
import { SpinnerProvider } from "../src/renderer/context/spinner-context";
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

const makeTask = (id: number, description: string, metadata?: unknown): Progress.TaskSnapshot =>
  Progress.TaskSnapshot({
    id: Progress.TaskId(id),
    parentId: null,
    description,
    status: "running",
    countDisplay: "processedOnly",
    transient: false,
    units: {
      succeeded: 1,
      failed: 0,
      processed: 1,
      total: 2,
    },
    startedAt: 0,
    completedAt: null,
    metadata,
  });

const renderWithColumns = (
  rows: ReadonlyArray<TaskRowModel>,
  columns: Map<Progress.TaskId, ReadonlyArray<TaskColumnDef<unknown>>>,
): string =>
  stripAnsi(
    renderToString(
      createElement(NowProvider, {
        active: false,
        nowOverride: 1_000,
        children: createElement(SpinnerProvider, {
          active: false,
          tickOverride: 0,
          children: createElement(ProgressRenderer, {
            rows,
            columns,
          }),
        }),
      }),
    ),
  );

describe("rendererv2 public api", () => {
  test("renders null when there are no rows", () => {
    const output = renderWithColumns([], new Map());
    expect(output).toBe("");
  });

  test("renders basic rows with built-in columns", () => {
    const output = renderWithColumns(
      [deriveRow(makeTask(1, "task-a")), deriveRow(makeTask(2, "task-b"))],
      new Map(),
    );

    expect(output).toContain("task-a");
    expect(output).toContain("task-b");
  });

  test("renders custom columns from the columns map", () => {
    interface TestMeta {
      readonly model: string;
    }

    const taskId = Progress.TaskId(1);
    const columns = new Map<Progress.TaskId, ReadonlyArray<TaskColumnDef<unknown>>>([
      [
        taskId,
        [
          {
            header: "Model",
            render: (t) => (t.metadata as TestMeta).model,
          } as TaskColumnDef<unknown>,
        ],
      ],
    ]);

    const output = renderWithColumns(
      [deriveRow(makeTask(1, "my-task", { model: "gpt-4" } satisfies TestMeta))],
      columns,
    );

    expect(output).toContain("my-task");
    expect(output).toContain("gpt-4");
  });

  test("renders empty cells for tasks without a custom column", () => {
    interface TestMeta {
      readonly model: string;
    }

    const taskId1 = Progress.TaskId(1);
    const _taskId2 = Progress.TaskId(2);

    const columns = new Map<Progress.TaskId, ReadonlyArray<TaskColumnDef<unknown>>>([
      [
        taskId1,
        [
          {
            header: "Model",
            render: (t) => (t.metadata as TestMeta).model,
          } as TaskColumnDef<unknown>,
        ],
      ],
    ]);

    const output = renderWithColumns(
      [
        deriveRow(makeTask(1, "task-with-model", { model: "gpt-4" } satisfies TestMeta)),
        deriveRow(makeTask(2, "task-without")),
      ],
      columns,
    );

    expect(output).toContain("task-with-model");
    expect(output).toContain("task-without");
    expect(output).toContain("gpt-4");
  });
});
