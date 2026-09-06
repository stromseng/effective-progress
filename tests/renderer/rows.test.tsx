import { describe, expect, test } from "bun:test";
import * as Progress from "../../src";
import { makeTaskSnapshot, makeRow as deriveRow, renderRows } from "../helpers/renderer";

const makeTask = (id: number): Progress.TaskSnapshot =>
  makeTaskSnapshot({
    id: Progress.TaskId(id),
    description: `task-${id}`,
    status: "done",
    units: { succeeded: 1, failed: 0, processed: 1, total: 1 },
    completedAt: 1_000,
  });

describe("renderer row rendering", () => {
  test("renders all rows directly without virtual scrolling", () => {
    const rows = Array.from({ length: 12 }, (_, index) => deriveRow(makeTask(index + 1)));
    const output = renderRows(rows);

    expect(output).toContain("task-1");
    expect(output).toContain("task-6");
    expect(output).toContain("task-12");
    expect(output.split("\n").length).toBe(12);
  });
});
