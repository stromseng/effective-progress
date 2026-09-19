import { describe, expect, test } from "bun:test";
import * as Progress from "../../src";
import { makeRow, makeTaskSnapshot, renderRows } from "../helpers/renderer";

const makeTask = (
  units: Progress.TaskSnapshot["units"],
  status: Progress.TaskStatus,
  countDisplay: Progress.TaskCountDisplay = "detailed",
): Progress.TaskSnapshot =>
  makeTaskSnapshot({
    status,
    countDisplay,
    units,
    completedAt: status === "running" ? null : 1_000,
    progressSamples: [
      { timestamp: 0, processed: 0 },
      { timestamp: 1_000, processed: units.processed },
    ],
  });

const renderAmount = (task: Progress.TaskSnapshot): string =>
  renderRows([makeRow(task)], {
    columns: new Map([[task.id, [Progress.Columns.amount()]]]),
  }).trim();

describe("determinate amount formatting", () => {
  test("renders only processed/total for processed-only mode", () => {
    const task = makeTask(
      { succeeded: 3, failed: 1, processed: 4, total: 4 },
      "failed",
      "processedOnly",
    );
    expect(renderAmount(task)).toBe("4/4");
  });

  test("renders succeeded/failed and processed/total for detailed mode", () => {
    const task = makeTask({ succeeded: 3, failed: 1, processed: 4, total: 4 }, "done");
    expect(renderAmount(task)).toBe("3 1 4/4");
  });

  test("renders raw overflow counts for determinate tasks", () => {
    const task = makeTask({ succeeded: 6, failed: 2, processed: 8, total: 5 }, "done");
    expect(renderAmount(task)).toBe("6 2 8/5");
  });

  test("renders zero-total determinate counts as 0/0", () => {
    const task = makeTask(
      { succeeded: 0, failed: 0, processed: 0, total: 0 },
      "done",
      "processedOnly",
    );
    expect(renderAmount(task)).toBe("0/0");
  });

  test("renders processed/? for counted indeterminate tasks", () => {
    const task = makeTask({ succeeded: 3, failed: 1, processed: 4 }, "failed", "processedOnly");
    expect(renderAmount(task)).toBe("4/?");
  });

  test("renders succeeded/failed and processed/? for detailed indeterminate tasks", () => {
    const task = makeTask({ succeeded: 3, failed: 1, processed: 4 }, "done");
    expect(renderAmount(task)).toBe("3 1 4/?");
  });
});
