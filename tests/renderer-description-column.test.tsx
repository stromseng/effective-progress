import { describe, expect, test } from "bun:test";
import { renderToString } from "ink";
import stripAnsi from "strip-ansi";
import * as Progress from "../src";
import { DescriptionColumn } from "../src/services/renderer/columns/description-column";
import { NowProvider } from "../src/services/renderer/context/now-context";
import { SpinnerProvider } from "../src/services/renderer/context/spinner-context";
import type { TaskRowModel } from "../src/services/store/types";

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
    progressSamples: [
      { timestamp: 0, processed: 0 },
      { timestamp: 1_000, processed: 1 },
    ],
    metadata: undefined,
  });

const renderDescriptionColumn = (rows: ReadonlyArray<TaskRowModel>, spinnerTick?: number): string =>
  stripAnsi(
    renderToString(
      <NowProvider active={false} nowOverride={0}>
        <SpinnerProvider active={false} tickOverride={spinnerTick}>
          <DescriptionColumn rows={rows} />
        </SpinnerProvider>
      </NowProvider>,
    ),
  );

describe("renderer description tree planning", () => {
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

    const output = renderDescriptionColumn(rows);

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

    const output = renderDescriptionColumn(rows, 2);

    expect(output.includes("⠹ root")).toBeTrue();
    expect(output.includes("⠋ root")).toBeFalse();
  });

  test("renders tree prefixes for nested tasks", () => {
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

    const output = renderDescriptionColumn(rows);

    expect(output).toContain("✓ root");
    expect(output).toContain("└─ ✓ child");
    expect(output).toContain("└─ ✓ grandchild");
  });
});
