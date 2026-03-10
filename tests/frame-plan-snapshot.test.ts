import { describe, expect, test } from "bun:test";
import { renderToString } from "ink";
import fastStringWidth from "fast-string-width";
import { createElement } from "react";
import stripAnsi from "strip-ansi";
import * as Progress from "../src";
import { RootColumn } from "../src/ink-renderer/columns/root-column";
import type { TaskRowModel } from "../src/ink-renderer/store/types";

const treePrefix = (tree: TaskRowModel["tree"]): string => {
  if (tree.depth <= 0) {
    return "";
  }

  return `${tree.ancestorHasNextSibling.slice(1).map((hasNextSibling) => (hasNextSibling ? "│  " : "   ")).join("")}${tree.hasNextSibling ? "├─ " : "└─ "}`;
};

const task = Progress.TaskSnapshot({
  id: Progress.TaskId(1),
  parentId: null,
  description: "verify",
  status: "running",
  countDisplay: "detailed",
  transient: false,
  units: {
    succeeded: 12,
    failed: 3,
    processed: 15,
    total: 20,
  },
  startedAt: 0,
  completedAt: null,
});

const tree: TaskRowModel["tree"] = {
  depth: 1,
  hasChildren: false,
  hasNextSibling: false,
  ancestorHasNextSibling: [false],
};

const row: TaskRowModel = {
  task,
  tree,
  derived: {
    treePrefix: treePrefix(tree),
    treePrefixWidth: fastStringWidth(treePrefix(tree)),
    descriptionWidth: fastStringWidth(task.description),
    treePrefixedDescriptionWidth: fastStringWidth(treePrefix(tree)) + fastStringWidth(task.description),
    hasRenderableProgress: task.units.total !== undefined || task.units.processed > 0,
    isDeterminate: task.units.total !== undefined,
  },
};

const NOW = 9_000;
const TICK = 0;

const renderFramePlan = (startWidth: number): string =>
  Array.from({ length: startWidth }, (_, index) => startWidth - index)
    .map((terminalWidth) => {
      const output = stripAnsi(
        renderToString(
          createElement(RootColumn, {
            rows: [row],
            terminalColumns: terminalWidth,
            spinnerTick: TICK,
            nowOverride: NOW,
          }),
          { columns: terminalWidth },
        ),
      );
      const outputWidth = fastStringWidth(output);
      const paddedOutput =
        outputWidth < terminalWidth ? `${output}${" ".repeat(terminalWidth - outputWidth)}` : output;

      return `${terminalWidth}:${outputWidth}:${paddedOutput}|`;
    })
    .join("\n");

describe("Frame plan snapshot", () => {
  test("matches the old renderer baseline", () => {
    expect(renderFramePlan(45)).toMatchSnapshot();
  });
});
