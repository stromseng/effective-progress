import { describe, expect, test } from "bun:test";
import { renderToString } from "ink";
import { createElement } from "react";
import stripAnsi from "strip-ansi";
import * as Progress from "../src";
import {
  createAmountColumn,
  defaultAmountColumnConfig,
} from "../src/renderer/columns/amount-column";
import { createBarColumn, defaultBarColumnConfig } from "../src/renderer/columns/bar-column";
import { createDescriptionColumn } from "../src/renderer/columns/description-column";
import { NowProvider } from "../src/renderer/context/now-context";
import { CreateProgressRenderer } from "../src/renderer/public-api";
import { SpinnerProvider } from "../src/renderer/context/spinner-context";
import type { TaskRowModel } from "../src/renderer/store/types";

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

const makeTask = (
  id: number,
  description: string,
  countDisplay: Progress.TaskCountDisplay,
  units: Progress.TaskSnapshot["units"],
): Progress.TaskSnapshot =>
  Progress.TaskSnapshot({
    id: Progress.TaskId(id),
    parentId: null,
    description,
    status: units.total !== undefined && units.processed < units.total ? "failed" : "done",
    countDisplay,
    transient: false,
    units,
    startedAt: 0,
    completedAt: 1_000,
  });

const renderColumns = (rows: ReadonlyArray<TaskRowModel>, width: number): string => {
  const Renderer = CreateProgressRenderer([
    createDescriptionColumn({
      minWidth: 1,
      sticky: true,
    }),
    createBarColumn(defaultBarColumnConfig),
    createAmountColumn(defaultAmountColumnConfig),
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
            rows: [...rows],
            terminalColumns: width,
          }),
        }),
      }),
      { columns: width },
    ),
  );
};

const lastBarIndex = (line: string): number =>
  Math.max(line.lastIndexOf("━"), line.lastIndexOf("─"));

describe("rendererv2 progress columns", () => {
  test("keeps determinate progress bars equally wide across mixed amount widths", () => {
    const output = renderColumns(
      [
        deriveRow(
          makeTask(1, "fail-fast", "processedOnly", {
            succeeded: 3,
            failed: 0,
            processed: 3,
            total: 4,
          }),
        ),
        deriveRow(
          makeTask(2, "collect-all", "detailed", {
            succeeded: 3,
            failed: 1,
            processed: 4,
            total: 4,
          }),
        ),
        deriveRow(
          makeTask(3, "manual-mix", "detailed", {
            succeeded: 8,
            failed: 2,
            processed: 10,
            total: 10,
          }),
        ),
      ],
      80,
    );

    const lines = output.split("\n").filter((line) => line.length > 0);
    const barEnds = lines.map(lastBarIndex);

    expect(new Set(barEnds).size).toBe(1);
  });

  test("aligns success and failure slots across detailed amount rows", () => {
    const output = renderColumns(
      [
        deriveRow(
          makeTask(1, "all-succeeded", "detailed", {
            succeeded: 3,
            failed: 0,
            processed: 3,
            total: 3,
          }),
        ),
        deriveRow(
          makeTask(2, "all-failed__", "detailed", {
            succeeded: 0,
            failed: 3,
            processed: 3,
            total: 3,
          }),
        ),
        deriveRow(
          makeTask(3, "manual-mix__", "detailed", {
            succeeded: 8,
            failed: 2,
            processed: 10,
            total: 10,
          }),
        ),
      ],
      80,
    );

    const lines = output
      .split("\n")
      .filter(
        (line) =>
          line.includes("all-succeeded") ||
          line.includes("all-failed__") ||
          line.includes("manual-mix__"),
      );
    const amountSegments = lines.map((line) => line.slice(lastBarIndex(line) + 2));
    const firstGap = amountSegments.map((segment) => segment.indexOf(" "));
    const secondGap = amountSegments.map((segment) => segment.indexOf(" ", firstGap[0]! + 1));

    expect(new Set(firstGap).size).toBe(1);
    expect(new Set(secondGap).size).toBe(1);
  });
});
