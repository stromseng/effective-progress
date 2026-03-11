import { describe, expect, test } from "bun:test";
import { renderToString } from "ink";
import { createElement } from "react";
import stripAnsi from "strip-ansi";
import * as Progress from "../src";
import { createEtaColumn } from "../src/rendererv2/columns/eta-column";
import { CreateProgressRenderer } from "../src/rendererv2/public-api";
import type { TaskRowModel } from "../src/ink-renderer/store/types";

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

const makeTask = (): Progress.TaskSnapshot =>
  Progress.TaskSnapshot({
    id: Progress.TaskId(1),
    parentId: null,
    description: "eta-task",
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
  });

const renderEtaColumn = (width: number): string => {
  const Renderer = CreateProgressRenderer([
    createEtaColumn({
      minWidth: 0,
      justify: "right",
      paddingRight: 0,
      sticky: false,
    }),
  ]);

  return stripAnsi(
    renderToString(
      createElement(Renderer, {
        rows: [deriveRow(makeTask())],
        now: 1_000,
        terminalColumns: width,
      }),
      { columns: width },
    ),
  );
};

describe("rendererv2 eta column", () => {
  test("renders prefixed eta when there is enough width", () => {
    expect(renderEtaColumn(20)).toContain("ETA: 1s");
  });

  test("falls back to bare duration on narrow widths", () => {
    expect(renderEtaColumn(4)).toContain("1s");
    expect(renderEtaColumn(4)).not.toContain("ETA:");
  });
});
