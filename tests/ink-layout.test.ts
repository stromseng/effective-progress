import { describe, expect, test } from "bun:test";
import * as Progress from "../src";
import { computeFrameLayout } from "../src/ink-renderer/columns/frame-plan";
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

const row = (task: Progress.TaskSnapshot, depth = 0): TaskRowModel => ({
  task,
  tree: {
    depth,
    hasChildren: false,
    hasNextSibling: false,
    ancestorHasNextSibling: [],
  },
});

const widthOf = (layout: ReturnType<typeof computeFrameLayout>, id: string): number =>
  layout.columns.find((column) => column.id === id)?.width ?? 0;

const variantOf = (layout: ReturnType<typeof computeFrameLayout>, id: string): string =>
  layout.columns.find((column) => column.id === id)?.variantId ?? "hidden";

describe("frame layout planning", () => {
  test("caps growth at shared max widths for utility columns", () => {
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

    const layout = computeFrameLayout(rows, 10_000, 0, undefined, true);

    expect(layout.rowWidth).toBeLessThan(100);
    expect(widthOf(layout, "description")).toBeGreaterThan(0);
    expect(widthOf(layout, "description")).toBe(20);
    expect(widthOf(layout, "amount")).toBeGreaterThanOrEqual("999 0 999/1000".length);
    expect(widthOf(layout, "elapsed")).toBeGreaterThanOrEqual("59m 59s".length);
    expect(widthOf(layout, "eta")).toBeGreaterThanOrEqual("ETA: 1s".length);
    expect(widthOf(layout, "bar")).toBe(30);
  });

  test("hides eta/bar/amount when no determinate tasks need utility columns", () => {
    const rows = [
      row(
        makeTask(3, {
          status: "done",
          completedAt: 2_000,
          units: new Progress.IndeterminateTaskUnits({ spinnerFrame: 0 }),
        }),
      ),
    ];

    const layout = computeFrameLayout(rows, 2_000, 0, undefined, true);

    expect(widthOf(layout, "bar")).toBe(0);
    expect(widthOf(layout, "eta")).toBe(0);
    expect(widthOf(layout, "amount")).toBe(0);
    expect(widthOf(layout, "elapsed")).toBeGreaterThanOrEqual("2s".length);
    expect(layout.rowWidth).toBeLessThan(100);
  });

  test("expands beyond baseline when content requires more width", () => {
    const rows = [
      row(
        makeTask(4, {
          description:
            "this-is-a-very-long-description-that-should-force-the-row-width-beyond-the-default-100-columns",
        }),
      ),
    ];

    const layout = computeFrameLayout(rows, 1_000, 0, undefined, true);

    expect(layout.rowWidth).toBeGreaterThan(100);
    expect(widthOf(layout, "description")).toBeGreaterThan(8);
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

    const layout = computeFrameLayout(rows, 5_000, 0, 60, true);

    expect(layout.rowWidth).toBeLessThanOrEqual(60);
    expect(widthOf(layout, "elapsed")).toBeGreaterThan(0);
  });

  test("demotes description from tree to plain when width is constrained", () => {
    const rows = [
      row(makeTask(6, { description: "parent-node" }), 0),
      row(makeTask(7, { description: "child-node" }), 1),
    ];

    const wide = computeFrameLayout(rows, 5_000, 0, 90, true);
    const narrow = computeFrameLayout(rows, 5_000, 0, 30, true);

    expect(variantOf(wide, "description")).toBe("tree");
    expect(variantOf(narrow, "description")).toBe("plain");
  });

  test("demotes amount from detailed to processed variant on narrow terminals", () => {
    const rows = [
      row(
        makeTask(8, {
          countDisplay: "detailed",
          units: new Progress.DeterminateTaskUnits({
            succeeded: 12,
            failed: 3,
            processed: 15,
            total: 20,
          }),
        }),
      ),
    ];

    const wide = computeFrameLayout(rows, 5_000, 0, 80, true);
    const narrow = computeFrameLayout(rows, 5_000, 0, 22, true);

    expect(variantOf(wide, "amount")).toBe("detailed");
    expect(variantOf(narrow, "amount")).toBe("processed");
    expect(widthOf(narrow, "amount")).toBeLessThan(widthOf(wide, "amount"));
  });

  test("demotes ETA from prefixed to duration to primary before hiding", () => {
    const rows = [
      row(
        makeTask(12, {
          description: "eta-variant",
          units: new Progress.DeterminateTaskUnits({
            succeeded: 1,
            failed: 0,
            processed: 1,
            total: 1000,
          }),
        }),
      ),
    ];

    const prefixed = computeFrameLayout(rows, 10_000, 0, 55, true);
    const duration = computeFrameLayout(rows, 10_000, 0, 50, true);
    const primary = computeFrameLayout(rows, 10_000, 0, 47, true);
    const hidden = computeFrameLayout(rows, 10_000, 0, 43, true);

    expect(variantOf(prefixed, "eta")).toBe("prefixed");
    expect(variantOf(duration, "eta")).toBe("duration");
    expect(variantOf(primary, "eta")).toBe("primary");
    expect(widthOf(primary, "eta")).toBeGreaterThan(0);
    expect(widthOf(hidden, "eta")).toBe(0);
  });

  test("reclaims utility reserves under medium pressure", () => {
    const rows = [
      row(
        makeTask(9, {
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

    const medium = computeFrameLayout(rows, 1_000, 0, 90, true);
    const narrow = computeFrameLayout(rows, 1_000, 0, 70, true);

    expect(widthOf(narrow, "description")).toBeLessThanOrEqual(widthOf(medium, "description"));
    expect(widthOf(narrow, "elapsed")).toBeLessThan(widthOf(medium, "elapsed"));
    expect(widthOf(narrow, "eta")).toBeLessThan(widthOf(medium, "eta"));
  });

  test("shrinks bar before hiding ETA", () => {
    const rows = [
      row(
        makeTask(10, {
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

    const wide = computeFrameLayout(rows, 1_000, 0, 70, true);
    const narrow = computeFrameLayout(rows, 1_000, 0, 50, true);

    expect(widthOf(wide, "eta")).toBeGreaterThan(0);
    expect(widthOf(narrow, "eta")).toBeGreaterThan(0);
    expect(widthOf(narrow, "bar")).toBeLessThan(widthOf(wide, "bar"));
  });

  test("shrinks description before dropping processed amount", () => {
    const rows = [
      row(
        makeTask(11, {
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

    const medium = computeFrameLayout(rows, 1_000, 0, 50, true);
    const narrow = computeFrameLayout(rows, 1_000, 0, 40, true);

    expect(widthOf(narrow, "description")).toBeLessThan(widthOf(medium, "description"));
    expect(widthOf(narrow, "amount")).toBe(widthOf(medium, "amount"));
  });
});
