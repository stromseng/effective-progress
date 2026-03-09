import { describe, expect, test } from "bun:test";
import { Box, renderToString } from "ink";
import { createElement } from "react";
import * as Progress from "../src";
import { RootColumn } from "../src/ink-renderer/columns/root-column";
import type { TaskRowModel } from "../src/ink-renderer/snapshot/types";

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
    units: overrides.units ?? {
      succeeded: 1,
      failed: 0,
      processed: 1,
      total: 10,
    },
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

const computeLayout = (
  rows: ReadonlyArray<TaskRowModel>,
  now: number,
  tick: number,
  terminalColumns: number | undefined,
  isTTY: boolean,
  stickyWidths?: Map<string, number>,
) => RootColumn(rows, now, tick, terminalColumns, isTTY, stickyWidths);

const widthOf = (layout: ReturnType<typeof computeLayout>, id: string): number =>
  layout.columns.find((column) => column.id === id)?.width ?? 0;

const renderView = (rows: ReadonlyArray<TaskRowModel>, terminalColumns: number): string =>
  (() => {
    const rootColumn = RootColumn(rows, 10_000, 0, terminalColumns, true, new Map());
    return renderToString(
      createElement(Box, { flexDirection: "row" }, rootColumn.render()),
      { columns: terminalColumns },
    );
  })();

describe("frame layout planning", () => {
  test("caps growth at shared max widths for utility columns", () => {
    const rows = [
      row(
        makeTask(1, {
          startedAt: 0,
          units: {
            succeeded: 9,
            failed: 0,
            processed: 9,
            total: 10,
          },
        }),
      ),
      row(
        makeTask(2, {
          startedAt: 0,
          units: {
            succeeded: 999,
            failed: 0,
            processed: 999,
            total: 1000,
          },
        }),
      ),
    ];

    const layout = computeLayout(rows, 10_000, 0, undefined, true);

    expect(layout.rowWidth).toBeLessThan(100);
    expect(widthOf(layout, "description")).toBeGreaterThan(0);
    expect(widthOf(layout, "progress")).toBeGreaterThanOrEqual(40);
    expect(widthOf(layout, "elapsed")).toBeGreaterThanOrEqual("59m 59s".length);
    expect(widthOf(layout, "eta")).toBeGreaterThanOrEqual("ETA: 1s".length);
    expect(widthOf(layout, "progress")).toBeLessThanOrEqual(50);
  });

  test("hides eta/bar/amount when no determinate tasks need utility columns", () => {
    const rows = [
      row(
        makeTask(3, {
          status: "done",
          completedAt: 2_000,
          units: {
            succeeded: 0,
            failed: 0,
            processed: 0,
          },
        }),
      ),
    ];

    const layout = computeLayout(rows, 2_000, 0, undefined, true);

    expect(widthOf(layout, "progress")).toBe(0);
    expect(widthOf(layout, "eta")).toBe(0);
    expect(widthOf(layout, "elapsed")).toBeGreaterThanOrEqual("2s".length);
    expect(layout.rowWidth).toBeLessThan(100);
  });

  test("shows amount when indeterminate tasks have counted work", () => {
    const rows = [
      row(
        makeTask(32, {
          status: "failed",
          completedAt: 2_000,
          countDisplay: "processedOnly",
          units: {
            succeeded: 0,
            failed: 3,
            processed: 3,
          },
        }),
      ),
    ];

    const layout = computeLayout(rows, 2_000, 0, undefined, true);

    expect(widthOf(layout, "progress")).toBeGreaterThanOrEqual("3/?".length);
    expect(widthOf(layout, "eta")).toBe(0);
  });

  test("drops zero-width columns from the visible layout so they do not consume a gap", () => {
    const rows = [
      row(
        makeTask(31, {
          description: "tight",
          status: "failed",
          completedAt: 2_000,
          units: {
            succeeded: 0,
            failed: 0,
            processed: 0,
          },
        }),
      ),
    ];

    const layout = computeLayout(rows, 2_000, 0, 12, true);

    expect(layout.columns.map((column) => column.id)).toEqual(["description", "elapsed"]);
    expect(widthOf(layout, "progress")).toBe(0);
    expect(layout.rowWidth).toBeLessThanOrEqual(12);
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

    const layout = computeLayout(rows, 1_000, 0, undefined, true);

    expect(layout.rowWidth).toBeGreaterThan(100);
    expect(widthOf(layout, "description")).toBeGreaterThan(8);
  });

  test("compacts to terminal width in narrow terminals", () => {
    const rows = [
      row(
        makeTask(5, {
          description:
            "a-very-long-description-that-would-otherwise-wrap-and-break-terminal-frame-clearing",
          units: {
            succeeded: 123,
            failed: 0,
            processed: 123,
            total: 999,
          },
        }),
      ),
    ];

    const layout = computeLayout(rows, 5_000, 0, 60, true);

    expect(layout.rowWidth).toBeLessThanOrEqual(60);
    expect(widthOf(layout, "elapsed")).toBeGreaterThan(0);
  });

  test("suppresses tree prefixes when description width is constrained", () => {
    const rows = [
      row(makeTask(6, { description: "parent-node" }), 0),
      row(makeTask(7, { description: "child-node" }), 1),
    ];

    const wide = renderView(rows, 90);
    const narrow = renderView(rows, 22);

    expect(wide.includes("└─ ")).toBeTrue();
    expect(narrow.includes("└─ ")).toBeFalse();
  });

  test("uses less detailed amount text on narrow terminals", () => {
    const rows = [
      row(
        makeTask(8, {
          countDisplay: "detailed",
          units: {
            succeeded: 12,
            failed: 3,
            processed: 15,
            total: 20,
          },
        }),
      ),
    ];

    const wide = computeLayout(rows, 5_000, 0, 80, true);
    const narrow = computeLayout(rows, 5_000, 0, 22, true);
    const wideOutput = renderView(rows, 80);
    const narrowOutput = renderView(rows, 22);

    expect(widthOf(narrow, "progress")).toBeLessThan(widthOf(wide, "progress"));
    expect(wideOutput.includes("12  3 15/20")).toBeTrue();
    expect(narrowOutput.includes("12  3 15/20")).toBeFalse();
    expect(narrowOutput.includes("75%")).toBeTrue();
  });

  test("drops ETA when the root switches to a tighter column set", () => {
    const rows = [
      row(
        makeTask(12, {
          description: "eta-variant",
          units: {
            succeeded: 1,
            failed: 0,
            processed: 1,
            total: 1000,
          },
        }),
      ),
    ];

    const prefixed = renderView(rows, 55);
    const noEta = renderView(rows, 32);
    const noEtaOrElapsed = renderView(rows, 20);

    expect(prefixed.includes("ETA: ")).toBeTrue();
    expect(noEta.includes("ETA: ")).toBeFalse();
    expect(noEta.includes("2h 46m")).toBeFalse();
    expect(noEtaOrElapsed.includes("10s")).toBeFalse();
  });

  test("reclaims utility reserves under tighter widths", () => {
    const rows = [
      row(
        makeTask(9, {
          description: "short-desc",
          startedAt: 0,
          units: {
            succeeded: 1,
            failed: 0,
            processed: 1,
            total: 4,
          },
        }),
      ),
    ];

    const medium = computeLayout(rows, 1_000, 0, 80, true);
    const narrow = computeLayout(rows, 1_000, 0, 30, true);

    expect(widthOf(narrow, "description")).toBeLessThan(widthOf(medium, "description"));
    expect(widthOf(narrow, "progress")).toBeLessThan(widthOf(medium, "progress"));
    expect(widthOf(narrow, "eta")).toBeLessThan(widthOf(medium, "eta"));
  });

  test("shrinks progress before hiding ETA", () => {
    const rows = [
      row(
        makeTask(10, {
          description: "bar-vs-eta",
          startedAt: 0,
          units: {
            succeeded: 1,
            failed: 0,
            processed: 1,
            total: 4,
          },
        }),
      ),
    ];

    const wide = computeLayout(rows, 1_000, 0, 70, true);
    const narrow = computeLayout(rows, 1_000, 0, 50, true);

    expect(widthOf(wide, "eta")).toBeGreaterThan(0);
    expect(widthOf(narrow, "eta")).toBeGreaterThan(0);
    expect(widthOf(narrow, "progress")).toBeLessThan(widthOf(wide, "progress"));
  });

  test("switches to the percent progress set before shrinking utility columns further", () => {
    const rows = [
      row(
        makeTask(11, {
          description: "long-description-for-amount-priority",
          startedAt: 0,
          countDisplay: "processedOnly",
          units: {
            succeeded: 1,
            failed: 0,
            processed: 1,
            total: 1234,
          },
        }),
      ),
    ];

    const medium = computeLayout(rows, 1_000, 0, 70, true);
    const narrow = computeLayout(rows, 1_000, 0, 60, true);

    expect(widthOf(medium, "progress")).toBeGreaterThan(widthOf(narrow, "progress"));
    expect(widthOf(narrow, "description")).toBeGreaterThan(widthOf(medium, "description"));
  });

  test("switches to percentage when progress width drops below ten columns", () => {
    const rows = [
      row(
        makeTask(17, {
          description: "verify",
          units: {
            succeeded: 12,
            failed: 3,
            processed: 15,
            total: 20,
          },
        }),
      ),
    ];

    const layout = computeLayout(rows, 9_000, 0, 22, true);
    const output = renderView(rows, 22);

    expect(widthOf(layout, "progress")).toBeLessThan(10);
    expect(output.includes("75%")).toBeTrue();
    expect(output.includes("15/20")).toBeFalse();
  });

  test("keeps sticky description width until the frame empties", () => {
    const stickyWidths = new Map<string, number>();
    const longRows = [
      row(
        makeTask(13, {
          description:
            "very-long-description-that-expands-the-sticky-column-width-significantly-beyond-normal",
        }),
      ),
    ];
    const shortRows = [row(makeTask(14, { description: "short" }))];

    computeLayout(longRows, 10_000, 0, undefined, true, stickyWidths);
    const stickyLayout = computeLayout(shortRows, 10_000, 0, undefined, true, stickyWidths);
    const freshLayout = computeLayout(shortRows, 10_000, 0, undefined, true, new Map());

    expect(widthOf(stickyLayout, "description")).toBeGreaterThan(
      widthOf(freshLayout, "description"),
    );

    computeLayout([], 10_000, 0, undefined, true, stickyWidths);
    const resetLayout = computeLayout(shortRows, 10_000, 0, undefined, true, stickyWidths);

    expect(widthOf(resetLayout, "description")).toBe(widthOf(freshLayout, "description"));
  });

  test("sticky width never exceeds terminal constraints", () => {
    const stickyWidths = new Map<string, number>();
    const longRows = [
      row(
        makeTask(15, {
          description:
            "very-long-description-that-expands-the-sticky-column-width-significantly-beyond-normal",
        }),
      ),
    ];
    const shortRows = [row(makeTask(16, { description: "short" }))];

    computeLayout(longRows, 10_000, 0, 100, true, stickyWidths);
    const constrained = computeLayout(shortRows, 10_000, 0, 30, true, stickyWidths);

    expect(constrained.rowWidth).toBeLessThanOrEqual(30);
    expect(widthOf(constrained, "description")).toBeLessThanOrEqual(30);
  });
});
