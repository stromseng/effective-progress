import { describe, expect, test } from "bun:test";
import { renderToString } from "ink";
import { createElement } from "react";
import stripAnsi from "strip-ansi";
import * as Progress from "../src";
import { NowProvider } from "../src/ink-renderer/now-context";
import { SpinnerProvider } from "../src/ink-renderer/spinner-context";
import { createDescriptionColumn } from "../src/rendererv2/columns/description-column";
import { createElapsedColumn } from "../src/rendererv2/columns/elapsed-column";
import { createEtaColumn } from "../src/rendererv2/columns/eta-column";
import {
  createProgressColumn,
  defaultProgressColumnConfig,
} from "../src/rendererv2/columns/progress-column";
import { CreateProgressRenderer } from "../src/rendererv2/public-api";
import type { TaskRowModel } from "../src/ink-renderer/store/types";
import { textWidth } from "../src/ink-renderer/shared/text-width";

const deriveRow = (task: Progress.TaskSnapshot): TaskRowModel => ({
  task,
  tree: {
    depth: 0,
    hasChildren: false,
    hasNextSibling: false,
    ancestorHasNextSibling: [],
  },
  derived: {
    treePrefix: "",
    treePrefixWidth: 0,
    descriptionWidth: task.description.length,
    treePrefixedDescriptionWidth: task.description.length,
    hasRenderableProgress: task.units.total !== undefined || task.units.processed > 0,
    isDeterminate: task.units.total !== undefined,
  },
});

const makeTask = (): Progress.TaskSnapshot =>
  Progress.TaskSnapshot({
    id: Progress.TaskId(1),
    parentId: null,
    description: "eta-task",
    status: "running",
    countDisplay: "processedOnly",
    transient: false,
    units: {
      succeeded: 1,
      failed: 0,
      processed: 1,
      total: 2,
    },
    startedAt: 0,
    completedAt: null,
  });

const makeTightWidthTask = (): Progress.TaskSnapshot =>
  Progress.TaskSnapshot({
    id: Progress.TaskId(2),
    parentId: null,
    description: "really-long-task-name",
    status: "running",
    countDisplay: "processedOnly",
    transient: false,
    units: {
      succeeded: 10,
      failed: 0,
      processed: 10,
      total: 10,
    },
    startedAt: 0,
    completedAt: null,
  });

const renderEtaColumn = (width: number): string => {
  const Renderer = CreateProgressRenderer([
    createEtaColumn({
      minWidth: 3,
      justify: "right",
      sticky: false,
    }),
  ]);

  return stripAnsi(
    renderToString(
      createElement(NowProvider, {
        active: false,
        nowOverride: 1_000,
        children: createElement(Renderer, {
          rows: [deriveRow(makeTask())],
          terminalColumns: width,
        }),
      }),
      { columns: width },
    ),
  );
};

const renderEtaColumnAt = (width: number, now: number): string => {
  const Renderer = CreateProgressRenderer([
    createEtaColumn({
      minWidth: 3,
      justify: "right",
      sticky: false,
    }),
  ]);

  return stripAnsi(
    renderToString(
      createElement(NowProvider, {
        active: false,
        nowOverride: now,
        children: createElement(Renderer, {
          rows: [deriveRow(makeTask())],
          terminalColumns: width,
        }),
      }),
      { columns: width },
    ),
  );
};

const renderFullLayout = (width: number): string => {
  const Renderer = CreateProgressRenderer([
    createDescriptionColumn({
      minWidth: 1,
      sticky: true,
    }),
    createProgressColumn(defaultProgressColumnConfig),
    createElapsedColumn({
      minWidth: 2,
      justify: "right",
      sticky: true,
    }),
    createEtaColumn({
      minWidth: 3,
      justify: "right",
      sticky: true,
    }),
  ]);

  return stripAnsi(
    renderToString(
      createElement(NowProvider, {
        active: false,
        nowOverride: 1_000,
        children: createElement(SpinnerProvider, {
          active: false,
          tickOverride: 0,
          children: createElement(Renderer, {
            rows: [deriveRow(makeTask())],
            terminalColumns: width,
          }),
        }),
      }),
      { columns: width },
    ),
  );
};

const renderTightFullLayout = (width: number): string => {
  const Renderer = CreateProgressRenderer([
    createDescriptionColumn({
      minWidth: 1,
      sticky: true,
    }),
    createProgressColumn(defaultProgressColumnConfig),
    createElapsedColumn({
      minWidth: 2,
      justify: "right",
      sticky: true,
    }),
    createEtaColumn({
      minWidth: 3,
      justify: "right",
      sticky: true,
    }),
  ]);

  return stripAnsi(
    renderToString(
      createElement(NowProvider, {
        active: false,
        nowOverride: 10_000,
        children: createElement(SpinnerProvider, {
          active: false,
          tickOverride: 0,
          children: createElement(Renderer, {
            rows: [deriveRow(makeTightWidthTask())],
            terminalColumns: width,
          }),
        }),
      }),
      { columns: width },
    ),
  );
};

describe("rendererv2 eta column", () => {
  test("renders prefixed eta when there is enough width", () => {
    expect(renderEtaColumn(20)).toContain("ETA: 1s");
  });

  test("falls back to bare duration on narrow widths", () => {
    expect(renderEtaColumn(4)).toContain("1s");
    expect(renderEtaColumn(4)).not.toContain("ETA:");
  });

  test("measures the actual prefixed width instead of reserving a one-hour slot", () => {
    const column = createEtaColumn({
      minWidth: 3,
      justify: "right",
      sticky: false,
    });

    expect(column.measure({ rows: [deriveRow(makeTask())], now: 1_000 })).toEqual({
      minWidth: 3,
      preferredWidth: textWidth("ETA: 1s"),
      maxWidth: textWidth("ETA: 1s"),
    });
  });

  test("shrinks to a three-character compact unit from the left", () => {
    expect(renderEtaColumnAt(3, 88_320_000)).toBe("24h");
  });

  test("drops the ETA prefix in the full layout before the terminal gets extremely narrow", () => {
    const output = renderFullLayout(24);

    expect(output.endsWith("1s 1s")).toBeTrue();
    expect(output).not.toContain("ETA:");
  });

  test("keeps the left side of the row when the terminal is narrower than all column minimums", () => {
    const output = renderTightFullLayout(5);

    expect(textWidth(output)).toBeLessThanOrEqual(5);
    expect(output).not.toContain("10s");
    expect(output).toContain("…");
  });
});
