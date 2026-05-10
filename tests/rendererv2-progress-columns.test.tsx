import { describe, expect, test } from "bun:test";
import { renderToString } from "ink";
import stripAnsi from "strip-ansi";
import * as Progress from "../src";
import { NowProvider } from "../src/renderer/context/now-context";
import { ProgressRenderer } from "../src/renderer/public-api";
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
    progressSamples: [
      { timestamp: 0, processed: 0 },
      { timestamp: 1_000, processed: units.processed },
    ],
    metadata: undefined,
  });

const renderColumns = (rows: ReadonlyArray<TaskRowModel>): string =>
  stripAnsi(
    renderToString(
      <NowProvider active={false} nowOverride={1_000}>
        <SpinnerProvider active={false} tickOverride={0}>
          <ProgressRenderer rows={rows} columns={new Map()} />
        </SpinnerProvider>
      </NowProvider>,
    ),
  );

describe("rendererv2 progress columns", () => {
  test("renders amount values for all rows", () => {
    const output = renderColumns([
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
    ]);

    expect(output).toContain("3/4");
    expect(output).toContain("4/4");
  });

  test("renders amounts with consistent formatting across rows", () => {
    const output = renderColumns([
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
    ]);

    const lines = output
      .split("\n")
      .filter(
        (line) =>
          line.includes("all-succeeded") ||
          line.includes("all-failed__") ||
          line.includes("manual-mix__"),
      );

    expect(lines.length).toBe(3);
    for (const line of lines) {
      expect(line).toContain("/");
    }
  });
});
