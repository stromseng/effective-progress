import { describe, expect, test } from "bun:test";
import * as Progress from "../../src";
import { makeTaskSnapshot, makeRows, renderRows } from "../helpers/renderer";
import type { CellInfo } from "../../src/columns/types";

const makeTask = (
  id: number,
  description: string,
  status: Progress.TaskStatus = "done",
  parentId: Progress.TaskId | null = null,
): Progress.TaskSnapshot =>
  makeTaskSnapshot({
    id: Progress.TaskId(id),
    parentId,
    description,
    status,
    units: { succeeded: 1, failed: 0, processed: 1, total: 1 },
    completedAt: status === "running" ? null : 1_000,
  });

const renderDescriptionColumn = (rows: ReadonlyArray<CellInfo>, spinnerTick = 0): string =>
  renderRows(rows, {
    now: 0,
    spinnerTick,
    columns: new Map(rows.map((row) => [row.task.id, [Progress.Columns.description()]])),
  });

describe("renderer description tree planning", () => {
  test("renders the spinner after the tree prefix", () => {
    const rows = makeRows(
      [makeTask(1, "root", "running"), makeTask(2, "child task", "running", Progress.TaskId(1))],
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
    const output = renderDescriptionColumn(makeRows([makeTask(1, "root", "running")]), 2);
    expect(output).toContain("⠹ root");
    expect(output).not.toContain("⠋ root");
  });

  test("renders tree prefixes for nested tasks", () => {
    const rows = makeRows(
      [
        makeTask(1, "root"),
        makeTask(2, "child", "done", Progress.TaskId(1)),
        makeTask(3, "grandchild", "done", Progress.TaskId(2)),
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
