import { describe, expect, test } from "bun:test";
import * as Progress from "../../src";
import { makeRow, makeTaskSnapshot, renderRows } from "../helpers/renderer";

const renderAmount = (
  units: Progress.TaskUnits,
  status: Progress.TaskStatus,
  countDisplay: Progress.TaskCountDisplay = "detailed",
): string => {
  const task = makeTaskSnapshot({ status, countDisplay, units, completedAt: 1_000 });
  return renderRows([makeRow(task)], {
    columns: new Map([[task.id, [Progress.Columns.amount()]]]),
  }).trim();
};

describe("determinate amount formatting", () => {
  test("renders only processed/total for processed-only mode", () => {
    expect(
      renderAmount({ succeeded: 3, failed: 1, processed: 4, total: 4 }, "failed", "processedOnly"),
    ).toBe("4/4");
  });

  test("renders succeeded/failed and processed/total for detailed mode", () => {
    expect(renderAmount({ succeeded: 3, failed: 1, processed: 4, total: 4 }, "done")).toBe(
      "3 1 4/4",
    );
  });

  test("renders raw overflow counts for determinate tasks", () => {
    expect(renderAmount({ succeeded: 6, failed: 2, processed: 8, total: 5 }, "done")).toBe(
      "6 2 8/5",
    );
  });

  test("renders zero-total determinate counts as 0/0", () => {
    expect(
      renderAmount({ succeeded: 0, failed: 0, processed: 0, total: 0 }, "done", "processedOnly"),
    ).toBe("0/0");
  });

  test("renders processed/? for counted indeterminate tasks", () => {
    expect(renderAmount({ succeeded: 3, failed: 1, processed: 4 }, "failed", "processedOnly")).toBe(
      "4/?",
    );
  });

  test("renders succeeded/failed and processed/? for detailed indeterminate tasks", () => {
    expect(renderAmount({ succeeded: 3, failed: 1, processed: 4 }, "done")).toBe("3 1 4/?");
  });
});
