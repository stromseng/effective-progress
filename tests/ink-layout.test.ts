import { describe, expect, test } from "bun:test";
import stringWidth from "fast-string-width";
import { Box, renderToString } from "ink";
import { createElement } from "react";
import stripAnsi from "strip-ansi";
import * as Progress from "../src";
import { RootColumn } from "../src/ink-renderer/columns/root-column";
import type { TaskRowModel } from "../src/ink-renderer/store/types";

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

const renderRoot = (
  rows: ReadonlyArray<TaskRowModel>,
  now: number,
  tick: number,
  terminalColumns: number | undefined,
  stickyWidths?: Map<symbol, number>,
) =>
  stripAnsi(
    renderToString(
      createElement(
        Box,
        { flexDirection: "row" },
        RootColumn(rows, now, tick, terminalColumns, stickyWidths).render(),
      ),
      { columns: terminalColumns ?? 200 },
    ),
  );

const renderView = (rows: ReadonlyArray<TaskRowModel>, terminalColumns: number): string =>
  renderRoot(rows, 10_000, 0, terminalColumns, new Map());

const maxLineWidth = (output: string): number =>
  output.split("\n").reduce((max, line) => Math.max(max, stringWidth(line)), 0);

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

    const output = renderRoot(rows, 10_000, 0, undefined, new Map());

    expect(maxLineWidth(output)).toBeLessThan(100);
    expect(output.includes("999/1000")).toBeTrue();
    expect(output.includes("ETA: ")).toBeTrue();
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

    const output = renderRoot(rows, 2_000, 0, undefined, new Map());

    expect(output.includes("ETA: ")).toBeFalse();
    expect(output.includes("%")).toBeFalse();
    expect(output.includes("2s")).toBeTrue();
    expect(maxLineWidth(output)).toBeLessThan(100);
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

    const output = renderRoot(rows, 2_000, 0, undefined, new Map());

    expect(output.includes("3/?")).toBeTrue();
    expect(output.includes("ETA: ")).toBeFalse();
  });

  test("uses the full progress fallback when eta is unavailable", () => {
    const rows = [
      row(
        makeTask(42, {
          status: "done",
          completedAt: 10_000,
          units: {
            succeeded: 999,
            failed: 0,
            processed: 999,
            total: 1000,
          },
        }),
      ),
    ];

    const output = renderRoot(rows, 10_000, 0, undefined, new Map());

    expect(output.includes("999/1000")).toBeTrue();
    expect(output.includes("%")).toBeFalse();
    expect(output.includes("ETA: ")).toBeFalse();
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

    const output = renderRoot(rows, 2_000, 0, 12, new Map());

    expect(output.includes("ETA: ")).toBeFalse();
    expect(output.includes("%")).toBeFalse();
    expect(maxLineWidth(output)).toBeLessThanOrEqual(12);
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

    const output = renderRoot(rows, 1_000, 0, undefined, new Map());

    expect(maxLineWidth(output)).toBeGreaterThan(100);
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

    const output = renderRoot(rows, 5_000, 0, 60, new Map());

    expect(maxLineWidth(output)).toBeLessThanOrEqual(60);
    expect(output.includes("5s")).toBeTrue();
  });

  test("suppresses tree prefixes when description width is constrained", () => {
    const rows = [
      row(makeTask(6, { description: "parent-node" }), 0),
      row(makeTask(7, { description: "child-node" }), 1),
    ];

    const wide = renderView(rows, 90);
    const narrow = renderView(rows, 18);

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

    const wideOutput = renderView(rows, 80);
    const narrowOutput = renderView(rows, 22);

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
    const noEta = renderView(rows, 28);
    const noEtaOrElapsed = renderView(rows, 16);

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

    const medium = renderRoot(rows, 1_000, 0, 80, new Map());
    const narrow = renderRoot(rows, 1_000, 0, 28, new Map());

    expect(maxLineWidth(narrow)).toBeLessThan(maxLineWidth(medium));
    expect(medium.includes("ETA: ")).toBeTrue();
    expect(narrow.includes("ETA: ")).toBeFalse();
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

    const wide = renderRoot(rows, 1_000, 0, 70, new Map());
    const narrow = renderRoot(rows, 1_000, 0, 50, new Map());
    const percent = renderRoot(rows, 1_000, 0, 30, new Map());

    expect(wide.includes("ETA: ")).toBeTrue();
    expect(narrow.includes("ETA: ")).toBeTrue();
    expect(wide.includes("1/4")).toBeTrue();
    expect(narrow.includes("1/4")).toBeTrue();
    expect(percent.includes("25%")).toBeTrue();
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

    const medium = renderRoot(rows, 1_000, 0, 70, new Map());
    const narrow = renderRoot(rows, 1_000, 0, 30, new Map());
    const percent = renderRoot(rows, 1_000, 0, 20, new Map());

    expect(medium.includes("1/1234")).toBeTrue();
    expect(narrow.includes("1/1234")).toBeTrue();
    expect(percent.includes("1/1234")).toBeFalse();
    expect(percent.includes("%")).toBeTrue();
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

    const output = renderView(rows, 22);

    expect(output.includes("75%")).toBeTrue();
    expect(output.includes("15/20")).toBeFalse();
  });

  test("stays within the terminal width for very narrow layouts", () => {
    const rows = [
      row(
        makeTask(18, {
          description: "verify",
          units: {
            succeeded: 12,
            failed: 3,
            processed: 15,
            total: 20,
          },
        }),
        1,
      ),
    ];

    for (let columns = 1; columns <= 14; columns += 1) {
      const output = renderView(rows, columns);
      expect(maxLineWidth(output)).toBeLessThanOrEqual(columns);
    }
  });
});
