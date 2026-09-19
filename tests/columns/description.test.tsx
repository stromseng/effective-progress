import { describe, expect, test } from "bun:test";
import * as Progress from "../../src";
import { makeRow, makeRows, makeTaskSnapshot, renderRows } from "../helpers/renderer";
import type { TaskRow } from "../../src/columns/types";

const renderDescriptionColumn = (rows: ReadonlyArray<TaskRow>, spinnerTick = 0): string =>
  renderRows(rows, {
    now: 0,
    spinnerTick,
    columns: new Map(rows.map((row) => [row.task.id, [Progress.Columns.description()]])),
  });

describe("renderer description tree planning", () => {
  test("renders the spinner after the tree prefix", () => {
    const rows = makeRows(
      [
        makeTaskSnapshot({ id: Progress.TaskId(1), description: "root" }),
        makeTaskSnapshot({
          id: Progress.TaskId(2),
          description: "child task",
          parentId: Progress.TaskId(1),
        }),
      ],
      [
        { id: Progress.TaskId(1), depth: 0 },
        { id: Progress.TaskId(2), depth: 1 },
      ],
    );

    const output = renderDescriptionColumn(rows);
    expect(output).toContain("⠋ root");
    expect(output).toContain("└─ ⠋ child");
    expect(output).not.toContain("⠋ └─");
  });

  test("uses the spinner context instead of a renderer tick prop", () => {
    const output = renderDescriptionColumn(
      makeRows([makeTaskSnapshot({ id: Progress.TaskId(1), description: "root" })]),
      2,
    );
    expect(output).toContain("⠹ root");
    expect(output).not.toContain("⠋ root");
  });

  test("renders tree prefixes for nested tasks", () => {
    const done = (id: number, description: string, parentId: Progress.TaskId | null) =>
      makeTaskSnapshot({
        id: Progress.TaskId(id),
        description,
        parentId,
        status: "done",
        completedAt: 1_000,
        units: { succeeded: 1, failed: 0, processed: 1, total: 1 },
      });
    const rows = makeRows(
      [
        done(1, "root", null),
        done(2, "child", Progress.TaskId(1)),
        done(3, "grandchild", Progress.TaskId(2)),
      ],
      [
        { id: Progress.TaskId(1), depth: 0 },
        { id: Progress.TaskId(2), depth: 1 },
        { id: Progress.TaskId(3), depth: 2 },
      ],
    );

    const output = renderDescriptionColumn(rows);
    expect(output).toContain("✓ root");
    expect(output).toContain("└─ ✓ child");
    expect(output).toContain("   └─ ✓ grandchild");
  });
});

const renderIndicator = (units: Progress.TaskUnits, status: Progress.TaskStatus): string => {
  const task = makeTaskSnapshot({ status, units, completedAt: 1_000 });
  return renderRows([makeRow(task)], {
    columns: new Map([[task.id, [Progress.Columns.description()]]]),
  }).trim()[0]!;
};

describe("task indicators", () => {
  test("uses checkmark for full success", () => {
    expect(renderIndicator({ succeeded: 4, failed: 0, processed: 4, total: 4 }, "done")).toBe("✓");
  });

  test("uses tilde for partial success", () => {
    expect(renderIndicator({ succeeded: 3, failed: 1, processed: 4, total: 4 }, "done")).toBe("~");
  });

  test("uses x for failures", () => {
    expect(renderIndicator({ succeeded: 0, failed: 1, processed: 1, total: 4 }, "failed")).toBe(
      "✗",
    );
  });
});
