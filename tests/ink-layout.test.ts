import { describe, expect, test } from "bun:test";
import * as Progress from "../src";
import { computeSharedColumnWidths } from "../src/ink-renderer/layout";
import type { TaskRowModel } from "../src/ink-renderer/types";

const makeTask = (
  id: number,
  overrides: Partial<Progress.TaskSnapshot> & {
    units?: Progress.TaskSnapshot["units"];
  } = {},
): Progress.TaskSnapshot =>
  new Progress.TaskSnapshot({
    id: Progress.TaskId(id),
    parentId: null,
    description: `task-${id}`,
    status: "running",
    transient: false,
    units: overrides.units ?? new Progress.DeterminateTaskUnits({ completed: 1, total: 10 }),
    startedAt: 0,
    completedAt: null,
    ...overrides,
  });

const row = (task: Progress.TaskSnapshot): TaskRowModel => ({
  task,
  tree: {
    depth: 0,
    hasChildren: false,
    hasNextSibling: false,
    ancestorHasNextSibling: [],
  },
});

describe("shared ink column widths", () => {
  test("uses max width across rows for amount/elapsed/eta", () => {
    const rows = [
      row(
        makeTask(1, {
          startedAt: 0,
          units: new Progress.DeterminateTaskUnits({ completed: 9, total: 10 }),
        }),
      ),
      row(
        makeTask(2, {
          startedAt: 0,
          units: new Progress.DeterminateTaskUnits({ completed: 999, total: 1000 }),
        }),
      ),
    ];

    const widths = computeSharedColumnWidths(rows, 10_000, 0);

    expect(widths.row).toBeGreaterThanOrEqual(100);
    expect(widths.showTree).toBeTrue();
    expect(widths.description).toBeGreaterThan(0);
    expect(widths.amount).toBeGreaterThanOrEqual("999/1000".length);
    expect(widths.elapsed).toBeGreaterThanOrEqual("59m 59s".length);
    expect(widths.eta).toBeGreaterThanOrEqual("ETA: 1s".length);
    expect(widths.bar).toBeGreaterThan(0);
  });

  test("hides ETA and bar columns when no determinate running tasks need them", () => {
    const rows = [
      row(
        makeTask(3, {
          status: "done",
          completedAt: 2_000,
          units: new Progress.IndeterminateTaskUnits({ spinnerFrame: 0 }),
        }),
      ),
    ];

    const widths = computeSharedColumnWidths(rows, 2_000, 0);

    expect(widths.bar).toBe(0);
    expect(widths.eta).toBeGreaterThanOrEqual("ETA: 59m 59s".length);
    expect(widths.amount).toBeGreaterThan(0);
    expect(widths.elapsed).toBeGreaterThanOrEqual("59m 59s".length);
    expect(widths.row).toBe(100);
  });

  test("expands beyond 100 columns when descriptions require it", () => {
    const rows = [
      row(
        makeTask(4, {
          description:
            "this-is-a-very-long-description-that-should-force-the-row-width-beyond-the-default-100-columns",
        }),
      ),
    ];

    const widths = computeSharedColumnWidths(rows, 1_000, 0);

    expect(widths.row).toBeGreaterThan(100);
    expect(widths.description).toBeGreaterThan(8);
  });

  test("compacts to terminal width in narrow terminals", () => {
    const rows = [
      row(
        makeTask(5, {
          description:
            "a-very-long-description-that-would-otherwise-wrap-and-break-terminal-frame-clearing",
          units: new Progress.DeterminateTaskUnits({ completed: 123, total: 999 }),
        }),
      ),
    ];

    const widths = computeSharedColumnWidths(rows, 5_000, 0, 60);

    expect(widths.row).toBeLessThanOrEqual(60);
    expect(widths.showTree).toBeFalse();
    expect(widths.amount).toBeGreaterThan(0);
    expect(widths.elapsed).toBeGreaterThan(0);
  });
});
