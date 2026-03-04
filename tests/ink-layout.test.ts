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
    countDisplay: "detailed",
    transient: false,
    units:
      overrides.units ??
      new Progress.DeterminateTaskUnits({
        succeeded: 1,
        failed: 0,
        processed: 1,
        total: 10,
      }),
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
          units: new Progress.DeterminateTaskUnits({
            succeeded: 9,
            failed: 0,
            processed: 9,
            total: 10,
          }),
        }),
      ),
      row(
        makeTask(2, {
          startedAt: 0,
          units: new Progress.DeterminateTaskUnits({
            succeeded: 999,
            failed: 0,
            processed: 999,
            total: 1000,
          }),
        }),
      ),
    ];

    const widths = computeSharedColumnWidths(rows, 10_000, 0);

    expect(widths.row).toBeGreaterThanOrEqual(100);
    expect(widths.description).toBeGreaterThan(0);
    expect(widths.amount).toBeGreaterThanOrEqual("999 0 999/1000".length);
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
    expect(widths.eta).toBe(0);
    expect(widths.amount).toBe(0);
    expect(widths.elapsed).toBeGreaterThanOrEqual("2s".length);
    expect(widths.row).toBeLessThan(100);
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
          units: new Progress.DeterminateTaskUnits({
            succeeded: 123,
            failed: 0,
            processed: 123,
            total: 999,
          }),
        }),
      ),
    ];

    const widths = computeSharedColumnWidths(rows, 5_000, 0, 60);

    expect(widths.row).toBeLessThanOrEqual(60);
    expect(widths.amount).toBeGreaterThanOrEqual(0);
    expect(widths.elapsed).toBeGreaterThan(0);
  });

  test("omits succeeded/failed columns when all determinate rows are processed-only", () => {
    const rows = [
      row(
        makeTask(6, {
          countDisplay: "processedOnly",
          units: new Progress.DeterminateTaskUnits({
            succeeded: 5,
            failed: 1,
            processed: 6,
            total: 10,
          }),
        }),
      ),
      row(
        makeTask(7, {
          countDisplay: "processedOnly",
          units: new Progress.DeterminateTaskUnits({
            succeeded: 15,
            failed: 0,
            processed: 15,
            total: 15,
          }),
        }),
      ),
    ];

    const widths = computeSharedColumnWidths(rows, 10_000, 0);

    expect(widths.amountSucceeded).toBe(0);
    expect(widths.amountFailed).toBe(0);
    expect(widths.amountProcessed).toBe(2);
    expect(widths.amountTotal).toBe(2);
    expect(widths.amount).toBe(5);
  });

  test("reclaims utility reserves before shrinking description on narrow terminals", () => {
    const rows = [
      row(
        makeTask(8, {
          description: "short-desc",
          startedAt: 0,
          units: new Progress.DeterminateTaskUnits({
            succeeded: 1,
            failed: 0,
            processed: 1,
            total: 4,
          }),
        }),
      ),
    ];

    const medium = computeSharedColumnWidths(rows, 1_000, 0, 70);
    const narrow = computeSharedColumnWidths(rows, 1_000, 0, 60);

    expect(medium.description).toBe(narrow.description);
    expect(narrow.elapsed).toBeLessThan(medium.elapsed);
    expect(narrow.eta).toBeLessThan(medium.eta);
  });

  test("shrinks bar before hiding ETA text", () => {
    const rows = [
      row(
        makeTask(9, {
          description: "bar-vs-eta",
          startedAt: 0,
          units: new Progress.DeterminateTaskUnits({
            succeeded: 1,
            failed: 0,
            processed: 1,
            total: 4,
          }),
        }),
      ),
    ];

    const wide = computeSharedColumnWidths(rows, 1_000, 0, 70);
    const narrow = computeSharedColumnWidths(rows, 1_000, 0, 50);

    expect(wide.eta).toBeGreaterThan(0);
    expect(narrow.eta).toBeGreaterThan(0);
    expect(narrow.bar).toBeLessThan(wide.bar);
  });

  test("shrinks description before shrinking processed-total amount column", () => {
    const rows = [
      row(
        makeTask(10, {
          description: "long-description-for-amount-priority",
          startedAt: 0,
          countDisplay: "processedOnly",
          units: new Progress.DeterminateTaskUnits({
            succeeded: 1,
            failed: 0,
            processed: 1,
            total: 1234,
          }),
        }),
      ),
    ];

    const medium = computeSharedColumnWidths(rows, 1_000, 0, 30);
    const narrow = computeSharedColumnWidths(rows, 1_000, 0, 24);

    expect(narrow.description).toBeLessThan(medium.description);
    expect(narrow.amount).toBe(medium.amount);
  });
});
