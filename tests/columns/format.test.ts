import { describe, expect, test } from "bun:test";
import * as Progress from "../../src";
import { getTaskIndicator } from "../../src/columns/description";
import { formatAmount } from "../../src/columns/format";

const makeTask = (
  units: Progress.TaskSnapshot["units"],
  status: Progress.TaskStatus,
): Progress.TaskSnapshot =>
  ({
    id: Progress.TaskId(1),
    parentId: null,
    description: "task",
    status,
    countDisplay: "detailed",
    transient: false,
    units,
    startedAt: 0,
    completedAt: status === "running" ? null : 1_000,
    progressSamples: [
      { timestamp: 0, processed: 0 },
      { timestamp: 1_000, processed: units.processed },
    ],
    metadata: undefined,
  }) satisfies Progress.TaskSnapshot;

describe("determinate amount formatting", () => {
  test("renders only processed/total for processed-only mode", () => {
    const task = makeTask(
      {
        succeeded: 3,
        failed: 1,
        processed: 4,
        total: 4,
      },
      "failed",
    );
    const processedOnlyTask = {
      ...task,
      countDisplay: "processedOnly",
    } satisfies Progress.TaskSnapshot;

    expect(formatAmount(processedOnlyTask)).toBe("4/4");
  });

  test("renders succeeded/failed and processed/total for detailed mode", () => {
    const task = makeTask(
      {
        succeeded: 3,
        failed: 1,
        processed: 4,
        total: 4,
      },
      "done",
    );

    expect(formatAmount(task)).toBe("3 1 4/4");
  });

  test("renders raw overflow counts for determinate tasks", () => {
    const task = makeTask(
      {
        succeeded: 6,
        failed: 2,
        processed: 8,
        total: 5,
      },
      "done",
    );

    expect(formatAmount(task)).toBe("6 2 8/5");
  });

  test("renders zero-total determinate counts as 0/0", () => {
    const task = {
      ...makeTask(
        {
          succeeded: 0,
          failed: 0,
          processed: 0,
          total: 0,
        },
        "done",
      ),
      countDisplay: "processedOnly",
    } satisfies Progress.TaskSnapshot;

    expect(formatAmount(task)).toBe("0/0");
  });

  test("renders processed/? for counted indeterminate tasks", () => {
    const task = {
      ...makeTask(
        {
          succeeded: 3,
          failed: 1,
          processed: 4,
        },
        "failed",
      ),
      countDisplay: "processedOnly",
    } satisfies Progress.TaskSnapshot;

    expect(formatAmount(task)).toBe("4/?");
  });

  test("renders succeeded/failed and processed/? for detailed indeterminate tasks", () => {
    const task = makeTask(
      {
        succeeded: 3,
        failed: 1,
        processed: 4,
      },
      "done",
    );

    expect(formatAmount(task)).toBe("3 1 4/?");
  });
});

describe("task indicators", () => {
  test("uses checkmark for full success", () => {
    const task = makeTask(
      {
        succeeded: 4,
        failed: 0,
        processed: 4,
        total: 4,
      },
      "done",
    );

    expect(getTaskIndicator(task, 0)).toEqual({ symbol: "✓", color: "green" });
  });

  test("uses tilde for partial success", () => {
    const task = makeTask(
      {
        succeeded: 3,
        failed: 1,
        processed: 4,
        total: 4,
      },
      "done",
    );

    expect(getTaskIndicator(task, 0)).toEqual({ symbol: "~", color: "yellow" });
  });

  test("uses x for failures", () => {
    const task = makeTask(
      {
        succeeded: 0,
        failed: 1,
        processed: 1,
        total: 4,
      },
      "failed",
    );

    expect(getTaskIndicator(task, 0)).toEqual({ symbol: "✗", color: "red" });
  });
});
