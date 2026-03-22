import { describe, expect, test } from "bun:test";
import { renderToString } from "ink";
import { createElement } from "react";
import stripAnsi from "strip-ansi";
import * as Progress from "../src";
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
  columns: Map<Progress.TaskId, ReadonlyArray<Progress.ColumnDef<any, any>>>,
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

  test("renders basic rows with default columns", () => {
    const output = renderWithColumns(
      [deriveRow(makeTask(1, "task-a")), deriveRow(makeTask(2, "task-b"))],
      new Map(),
    );

    expect(output).toContain("task-a");
    expect(output).toContain("task-b");
  });

  test("renders different cells in the same visual column at the same index", () => {
    interface EvalMeta {
      readonly model: string;
      readonly score: number;
    }

    const columns = new Map<Progress.TaskId, ReadonlyArray<Progress.ColumnDef<any, any>>>([
      [
        Progress.TaskId(1),
        [
          Progress.Columns.description(),
          {
            flexShrink: 0,
            minWidth: 6,
            render: ({ task }) => task.metadata.model,
          },
        ],
      ],
      [
        Progress.TaskId(2),
        [
          Progress.Columns.description(),
          {
            align: "center",
            flexShrink: 0,
            minWidth: 6,
            render: ({ task }) => `${task.metadata.score}%`,
          },
        ],
      ],
    ]);

    const output = renderWithColumns(
      [
        deriveRow(makeTask(1, "model-task", { model: "gpt-4", score: 0 } satisfies EvalMeta)),
        deriveRow(makeTask(2, "score-task", { model: "", score: 97 } satisfies EvalMeta)),
      ],
      columns,
    );

    expect(output).toContain("model-task");
    expect(output).toContain("score-task");
    expect(output).toContain("gpt-4");
    expect(output).toContain("97%");
  });

  test("renders empty cells when a task has fewer positional columns", () => {
    const columns = new Map<Progress.TaskId, ReadonlyArray<Progress.ColumnDef<any, any>>>([
      [
        Progress.TaskId(1),
        [
          Progress.Columns.description(),
          {
            flexShrink: 0,
            minWidth: 6,
            render: () => "extra",
          },
        ],
      ],
      [Progress.TaskId(2), [Progress.Columns.description()]],
    ]);

    const output = renderWithColumns(
      [deriveRow(makeTask(1, "task-with-extra")), deriveRow(makeTask(2, "task-without-extra"))],
      columns,
    );

    expect(output).toContain("task-with-extra");
    expect(output).toContain("task-without-extra");
    expect(output).toContain("extra");
  });

  test("supports combining defaults with appended custom columns", () => {
    const columns = new Map<Progress.TaskId, ReadonlyArray<Progress.ColumnDef<any, any>>>([
      [
        Progress.TaskId(1),
        [
          ...Progress.Columns.defaults(),
          {
            flexShrink: 0,
            minWidth: 4,
            render: () => "tag",
          },
        ],
      ],
    ]);

    const output = renderWithColumns([deriveRow(makeTask(1, "tagged-task"))], columns);

    expect(output).toContain("tagged-task");
    expect(output).toContain("tag");
  });

  test("keeps prepared values isolated by prepare function at the same index", () => {
    const uppercase: Progress.ColumnDef<{ label: string }, string> = {
      prepare: (rows) =>
        rows
          .map((row) => row.task.metadata.label)
          .join(",")
          .toUpperCase(),
      render: ({ task }, { prepared }) => `${task.metadata.label}:${prepared}`,
    };
    const lengths: Progress.ColumnDef<{ count: number }, number> = {
      prepare: (rows) => rows.reduce((total, row) => total + row.task.metadata.count, 0),
      render: ({ task }, { prepared }) => `${task.metadata.count}/${prepared}`,
    };

    const output = renderWithColumns(
      [
        deriveRow(makeTask(1, "task-a", { label: "alpha" })),
        deriveRow(makeTask(2, "task-b", { count: 7 })),
      ],
      new Map<Progress.TaskId, ReadonlyArray<Progress.ColumnDef<any, any>>>([
        [Progress.TaskId(1), [Progress.Columns.description(), uppercase]],
        [Progress.TaskId(2), [Progress.Columns.description(), lengths]],
      ]),
    );

    expect(output).toContain("alpha:ALPHA");
    expect(output).toContain("7/7");
  });

  test("aggregates numeric sizing hints across different columns at the same index", () => {
    const output = renderWithColumns(
      [deriveRow(makeTask(1, "wide-a")), deriveRow(makeTask(2, "wide-b"))],
      new Map<Progress.TaskId, ReadonlyArray<Progress.ColumnDef<any, any>>>([
        [
          Progress.TaskId(1),
          [
            Progress.Columns.description(),
            {
              minWidth: 4,
              render: () => "a",
            },
          ],
        ],
        [
          Progress.TaskId(2),
          [
            Progress.Columns.description(),
            {
              minWidth: 8,
              render: () => "b",
            },
          ],
        ],
      ]),
    );

    expect(output).toContain("wide-a");
    expect(output).toContain("wide-b");
  });
});
