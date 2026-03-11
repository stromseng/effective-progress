import { renderToString } from "ink";
import * as Progress from "../src";
import { RootColumn } from "../src/ink-renderer/columns/root-column";
import type { TaskRowModel } from "../src/ink-renderer/store/types";
import fastStringWidth from "fast-string-width";

const treePrefix = (tree: TaskRowModel["tree"]): string => {
  if (tree.depth <= 0) {
    return "";
  }

  return `${tree.ancestorHasNextSibling
    .slice(1)
    .map((hasNextSibling) => (hasNextSibling ? "│  " : "   "))
    .join("")}${tree.hasNextSibling ? "├─ " : "└─ "}`;
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
    treePrefixedDescriptionWidth:
      fastStringWidth(treePrefix(tree)) + fastStringWidth(task.description),
    hasRenderableProgress: task.units.total !== undefined || task.units.processed > 0,
    isDeterminate: task.units.total !== undefined,
  },
};

const NOW = 9_000;
const TICK = 0;
const MIN_TERMINAL_WIDTH = 1;
const MAX_TERMINAL_WIDTH = 80;
const FALLBACK_TERMINAL_WIDTH = 80;
const detectedColumns = process.stdout.isTTY ? process.stdout.columns : FALLBACK_TERMINAL_WIDTH;
const normalizedColumns =
  typeof detectedColumns === "number" && Number.isFinite(detectedColumns)
    ? Math.floor(detectedColumns)
    : FALLBACK_TERMINAL_WIDTH;
const START_TERMINAL_WIDTH = Math.max(
  MIN_TERMINAL_WIDTH,
  Math.min(normalizedColumns, MAX_TERMINAL_WIDTH),
);
const TERMINAL_WIDTH_LABEL_WIDTH = `${START_TERMINAL_WIDTH}`.length;
const OUTPUT_WIDTH_LABEL_WIDTH = `${START_TERMINAL_WIDTH}`.length + 1;

for (
  let terminalWidth = START_TERMINAL_WIDTH;
  terminalWidth >= MIN_TERMINAL_WIDTH;
  terminalWidth--
) {
  const output = renderToString(
    <RootColumn
      rows={[row]}
      terminalColumns={terminalWidth}
      spinnerTick={TICK}
      nowOverride={NOW}
    />,
    {
      columns: terminalWidth,
    },
  );
  const outputWidth = fastStringWidth(output);
  const paddedOutput =
    outputWidth < terminalWidth ? `${output}${" ".repeat(terminalWidth - outputWidth)}` : output;
  console.log(
    `${`${terminalWidth}`.padStart(TERMINAL_WIDTH_LABEL_WIDTH, " ")}:${`${outputWidth}${outputWidth > terminalWidth ? "!" : ""}`.padStart(OUTPUT_WIDTH_LABEL_WIDTH, " ")}:${paddedOutput}|`,
  );
}
