import { describe, expect, test } from "bun:test";
import * as Progress from "../src";
import { getTaskIndicator } from "../src/services/renderer/columns/description-column";
import { formatAmount, getDeterminateProcessedColor } from "../src/services/renderer/shared/format";

const makeTask = (
  units: Progress.TaskSnapshot["units"],
  status: Progress.TaskStatus,
): Progress.TaskSnapshot =>
  Progress.TaskSnapshot({
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
  });

describe("determinate processed amount color", () => {
  test("green for all succeeded", () => {
    const task = makeTask(
      {
        succeeded: 4,
        failed: 0,
        processed: 4,
        total: 4,
      },
      "done",
    );

    expect(getDeterminateProcessedColor(task)).toBe("green");
  });

  test("yellow for mixed successes and failures", () => {
    const task = makeTask(
      {
        succeeded: 3,
        failed: 1,
        processed: 4,
        total: 4,
      },
      "done",
    );

    expect(getDeterminateProcessedColor(task)).toBe("yellow");
  });

  test("red for fail-fast failures", () => {
    const task = makeTask(
      {
        succeeded: 3,
        failed: 1,
        processed: 4,
        total: 10,
      },
      "failed",
    );

    expect(getDeterminateProcessedColor(task)).toBe("red");
  });

  test("red for all failed after full validation", () => {
    const task = makeTask(
      {
        succeeded: 0,
        failed: 4,
        processed: 4,
        total: 4,
      },
      "done",
    );

    expect(getDeterminateProcessedColor(task)).toBe("red");
  });

  test("green for successful determinate overflow", () => {
    const task = makeTask(
      {
        succeeded: 6,
        failed: 0,
        processed: 6,
        total: 5,
      },
      "done",
    );

    expect(getDeterminateProcessedColor(task)).toBe("green");
  });

  test("green for zero-total determinate tasks", () => {
    const task = makeTask(
      {
        succeeded: 0,
        failed: 0,
        processed: 0,
        total: 0,
      },
      "done",
    );

    expect(getDeterminateProcessedColor(task)).toBe("green");
  });
});

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
    const processedOnlyTask = Progress.TaskSnapshot({
      ...task,
      countDisplay: "processedOnly",
    });

    expect(formatAmount(processedOnlyTask, 0)).toBe("4/4");
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

    expect(formatAmount(task, 0)).toBe("3 1 4/4");
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

    expect(formatAmount(task, 0)).toBe("6 2 8/5");
  });

  test("renders zero-total determinate counts as 0/0", () => {
    const task = Progress.TaskSnapshot({
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
    });

    expect(formatAmount(task, 0)).toBe("0/0");
  });

  test("renders processed/? for counted indeterminate tasks", () => {
    const task = Progress.TaskSnapshot({
      ...makeTask(
        {
          succeeded: 3,
          failed: 1,
          processed: 4,
        },
        "failed",
      ),
      countDisplay: "processedOnly",
    });

    expect(formatAmount(task, 0)).toBe("4/?");
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

    expect(formatAmount(task, 0)).toBe("3 1 4/?");
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
