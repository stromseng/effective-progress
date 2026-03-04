import { describe, expect, test } from "bun:test";
import * as Progress from "../src";
import {
  formatAmount,
  getDeterminateProcessedColor,
  getTaskIndicator,
} from "../src/ink-renderer/format";

const makeTask = (
  units: Progress.DeterminateTaskUnits,
  status: Progress.TaskStatus,
): Progress.TaskSnapshot =>
  new Progress.TaskSnapshot({
    id: Progress.TaskId(1),
    parentId: null,
    description: "task",
    status,
    countDisplay: "detailed",
    transient: false,
    units,
    startedAt: 0,
    completedAt: status === "running" ? null : 1_000,
  });

describe("determinate processed amount color", () => {
  test("green for all succeeded", () => {
    const task = makeTask(
      new Progress.DeterminateTaskUnits({
        succeeded: 4,
        failed: 0,
        processed: 4,
        total: 4,
      }),
      "done",
    );

    expect(getDeterminateProcessedColor(task)).toBe("green");
  });

  test("yellow for mixed successes and failures", () => {
    const task = makeTask(
      new Progress.DeterminateTaskUnits({
        succeeded: 3,
        failed: 1,
        processed: 4,
        total: 4,
      }),
      "done",
    );

    expect(getDeterminateProcessedColor(task)).toBe("yellow");
  });

  test("red for fail-fast failures", () => {
    const task = makeTask(
      new Progress.DeterminateTaskUnits({
        succeeded: 3,
        failed: 1,
        processed: 4,
        total: 10,
      }),
      "failed",
    );

    expect(getDeterminateProcessedColor(task)).toBe("red");
  });

  test("red for all failed after full validation", () => {
    const task = makeTask(
      new Progress.DeterminateTaskUnits({
        succeeded: 0,
        failed: 4,
        processed: 4,
        total: 4,
      }),
      "done",
    );

    expect(getDeterminateProcessedColor(task)).toBe("red");
  });
});

describe("determinate amount formatting", () => {
  test("renders only processed/total for processed-only mode", () => {
    const task = makeTask(
      new Progress.DeterminateTaskUnits({
        succeeded: 3,
        failed: 1,
        processed: 4,
        total: 4,
      }),
      "failed",
    );
    const processedOnlyTask = new Progress.TaskSnapshot({
      ...task,
      countDisplay: "processedOnly",
    });

    expect(formatAmount(processedOnlyTask, 0)).toBe("4/4");
  });

  test("renders succeeded/failed and processed/total for detailed mode", () => {
    const task = makeTask(
      new Progress.DeterminateTaskUnits({
        succeeded: 3,
        failed: 1,
        processed: 4,
        total: 4,
      }),
      "done",
    );

    expect(formatAmount(task, 0)).toBe("3 1 4/4");
  });
});

describe("task indicators", () => {
  test("uses checkmark for full success", () => {
    const task = makeTask(
      new Progress.DeterminateTaskUnits({
        succeeded: 4,
        failed: 0,
        processed: 4,
        total: 4,
      }),
      "done",
    );

    expect(getTaskIndicator(task, 0)).toEqual({ symbol: "✓", color: "green" });
  });

  test("uses tilde for partial success", () => {
    const task = makeTask(
      new Progress.DeterminateTaskUnits({
        succeeded: 3,
        failed: 1,
        processed: 4,
        total: 4,
      }),
      "done",
    );

    expect(getTaskIndicator(task, 0)).toEqual({ symbol: "~", color: "yellow" });
  });

  test("uses x for failures", () => {
    const task = makeTask(
      new Progress.DeterminateTaskUnits({
        succeeded: 0,
        failed: 1,
        processed: 1,
        total: 4,
      }),
      "failed",
    );

    expect(getTaskIndicator(task, 0)).toEqual({ symbol: "✗", color: "red" });
  });
});
