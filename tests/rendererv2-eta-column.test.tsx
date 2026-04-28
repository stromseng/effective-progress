import { describe, expect, test } from "bun:test";
import { renderToString } from "ink";
import { createElement } from "react";
import stripAnsi from "strip-ansi";
import * as Progress from "../src";
import { NowProvider } from "../src/renderer/context/now-context";
import { SpinnerProvider } from "../src/renderer/context/spinner-context";
import { ProgressRenderer } from "../src/renderer/public-api";
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

const makeTask = (overrides: Partial<Progress.TaskSnapshot> = {}): Progress.TaskSnapshot =>
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
    progressSamples: [
      { timestamp: 0, processed: 0 },
      { timestamp: 1_000, processed: 1 },
    ],
    metadata: undefined,
    ...overrides,
  });

const renderTaskWithEta = (task: Progress.TaskSnapshot, now: number): string =>
  stripAnsi(
    renderToString(
      createElement(NowProvider, {
        active: false,
        nowOverride: now,
        children: createElement(SpinnerProvider, {
          active: false,
          tickOverride: 0,
          children: createElement(ProgressRenderer, {
            rows: [deriveRow(task)],
            columns: new Map<Progress.TaskId, ReadonlyArray<Progress.ColumnDef<any, any>>>([
              [Progress.TaskId(1), [Progress.Columns.description(), Progress.Columns.eta()]],
            ]),
          }),
        }),
      }),
    ),
  );

const renderWithEta = (now: number): string => renderTaskWithEta(makeTask(), now);

describe("rendererv2 eta column", () => {
  test("renders prefixed eta when task has progress", () => {
    const output = renderWithEta(1_000);
    expect(output).toContain("ETA: 00:01");
  });

  test("does not render ETA for completed tasks", () => {
    const completedTask = Progress.TaskSnapshot({
      id: Progress.TaskId(1),
      parentId: null,
      description: "done-task",
      status: "done",
      countDisplay: "processedOnly",
      transient: false,
      units: {
        succeeded: 2,
        failed: 0,
        processed: 2,
        total: 2,
      },
      startedAt: 0,
      completedAt: 1_000,
      progressSamples: [
        { timestamp: 0, processed: 0 },
        { timestamp: 1_000, processed: 2 },
      ],
      metadata: undefined,
    });

    const output = stripAnsi(
      renderToString(
        createElement(NowProvider, {
          active: false,
          nowOverride: 1_000,
          children: createElement(SpinnerProvider, {
            active: false,
            tickOverride: 0,
            children: createElement(ProgressRenderer, {
              rows: [deriveRow(completedTask)],
              columns: new Map(),
            }),
          }),
        }),
      ),
    );

    expect(output).not.toContain("ETA:");
  });

  test("renders longer ETA for slow tasks", () => {
    const output = renderTaskWithEta(
      makeTask({
        progressSamples: [
          { timestamp: 0, processed: 0 },
          { timestamp: 88_320_000, processed: 1 },
        ],
      }),
      88_320_000,
    );
    expect(output).toContain("ETA:");
    expect(output).toContain("24:32:00");
  });

  test("uses recent progress samples instead of lifetime average", () => {
    const output = renderTaskWithEta(
      makeTask({
        units: {
          succeeded: 11,
          failed: 0,
          processed: 11,
          total: 12,
        },
        progressSamples: [
          { timestamp: 0, processed: 0 },
          { timestamp: 10_000, processed: 1 },
          { timestamp: 40_000, processed: 11 },
        ],
      }),
      40_000,
    );

    expect(output).toContain("ETA: 00:03");
  });
});
