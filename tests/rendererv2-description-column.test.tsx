import { describe, expect, test } from "bun:test";
import { renderToString } from "ink";
import { createElement } from "react";
import stripAnsi from "strip-ansi";
import * as Progress from "../src";
import { SpinnerProvider } from "../src/ink-renderer/spinner-context";
import { createDescriptionColumn } from "../src/rendererv2/columns/description-column";
import { CreateProgressRenderer } from "../src/rendererv2/public-api";
import type { TaskRowModel } from "../src/ink-renderer/store/types";

const treePrefix = (tree: TaskRowModel["tree"]): string => {
  if (tree.depth <= 0) {
    return "";
  }

  return `${tree.ancestorHasNextSibling
    .slice(1)
    .map((hasNextSibling) => (hasNextSibling ? "│  " : "   "))
    .join("")}${tree.hasNextSibling ? "├─ " : "└─ "}`;
};

const deriveRow = (task: Progress.TaskSnapshot, tree: TaskRowModel["tree"]): TaskRowModel => {
  const prefix = treePrefix(tree);

  return {
    task,
    tree,
    derived: {
      treePrefix: prefix,
      treePrefixWidth: prefix.length,
      descriptionWidth: task.description.length,
      treePrefixedDescriptionWidth: prefix.length + task.description.length,
      hasRenderableProgress: task.units.total !== undefined || task.units.processed > 0,
      isDeterminate: task.units.total !== undefined,
    },
  };
};

const makeTask = (
  id: number,
  description: string,
  status: Progress.TaskSnapshot["status"] = "done",
): Progress.TaskSnapshot =>
  Progress.TaskSnapshot({
    id: Progress.TaskId(id),
    parentId: null,
    description,
    status,
    countDisplay: "processedOnly",
    transient: false,
    units: {
      succeeded: 1,
      failed: 0,
      processed: 1,
      total: 1,
    },
    startedAt: 0,
    completedAt: status === "running" ? null : 1_000,
  });

const renderDescriptionColumn = (
  rows: ReadonlyArray<TaskRowModel>,
  terminalColumns: number,
  spinnerTick?: number,
): string => {
  const Renderer = CreateProgressRenderer([
    createDescriptionColumn({
      minWidth: 1,
      paddingRight: 0,
      sticky: false,
    }),
  ]);

  return stripAnsi(
    renderToString(
      createElement(
        SpinnerProvider,
        {
          active: false,
          tickOverride: spinnerTick,
          children: createElement(Renderer, {
            rows,
            now: 0,
            terminalColumns,
          }),
        },
      ),
      { columns: terminalColumns },
    ),
  );
};

describe("rendererv2 description tree planning", () => {
  test("renders the spinner after the tree prefix", () => {
    const rows = [
      deriveRow(makeTask(1, "root", "running"), {
        depth: 0,
        hasChildren: true,
        hasNextSibling: false,
        ancestorHasNextSibling: [],
      }),
      deriveRow(makeTask(2, "child", "running"), {
        depth: 1,
        hasChildren: false,
        hasNextSibling: false,
        ancestorHasNextSibling: [false],
      }),
    ];

    const output = renderDescriptionColumn(rows, 20);

    expect(output.includes("⠋ root")).toBeTrue();
    expect(output.includes("└─ ⠋ child")).toBeTrue();
    expect(output.includes("⠋ └─")).toBeFalse();
  });

  test("uses the spinner context instead of a renderer tick prop", () => {
    const rows = [
      deriveRow(makeTask(1, "root", "running"), {
        depth: 0,
        hasChildren: false,
        hasNextSibling: false,
        ancestorHasNextSibling: [],
      }),
    ];

    const output = renderDescriptionColumn(rows, 20, 2);

    expect(output.includes("⠹ root")).toBeTrue();
    expect(output.includes("⠋ root")).toBeFalse();
  });

  test("plans tree prefixes globally for the whole column", () => {
    const rows = [
      deriveRow(makeTask(1, "root"), {
        depth: 0,
        hasChildren: true,
        hasNextSibling: false,
        ancestorHasNextSibling: [],
      }),
      deriveRow(makeTask(2, "child"), {
        depth: 1,
        hasChildren: true,
        hasNextSibling: false,
        ancestorHasNextSibling: [false],
      }),
      deriveRow(makeTask(3, "grandchild"), {
        depth: 2,
        hasChildren: false,
        hasNextSibling: false,
        ancestorHasNextSibling: [false, false],
      }),
    ];

    const mixedThresholdWidth = 11;
    const narrow = renderDescriptionColumn(rows, mixedThresholdWidth);
    const wide = renderDescriptionColumn(rows, 20);

    expect(wide.includes("└─ ")).toBeTrue();
    expect(narrow.includes("└─ ")).toBeFalse();
    expect(narrow.includes("│")).toBeFalse();
  });
});
