import { renderToString } from "ink";
import * as Progress from "../src";
import { ProgressApp } from "../src/ink-renderer/app";
import type { TaskRowModel } from "../src/ink-renderer/types";

const task = new Progress.TaskSnapshot({
  id: Progress.TaskId(1),
  parentId: null,
  description: "verify",
  status: "running",
  countDisplay: "detailed",
  transient: false,
  units: new Progress.DeterminateTaskUnits({
    succeeded: 12,
    failed: 3,
    processed: 15,
    total: 20,
  }),
  startedAt: 0,
  completedAt: null,
});

const row: TaskRowModel = {
  task,
  tree: {
    depth: 1,
    hasChildren: false,
    hasNextSibling: false,
    ancestorHasNextSibling: [false],
  },
};

const NOW = 9_000;
const TICK = 0;
const MIN_TERMINAL_WIDTH = 20;
const detectedColumns = process.stdout.isTTY ? process.stdout.columns : undefined;
const START_TERMINAL_WIDTH = Math.max(
  MIN_TERMINAL_WIDTH,
  detectedColumns !== undefined ? Math.floor(detectedColumns) : 200,
);

for (
  let terminalWidth = START_TERMINAL_WIDTH;
  terminalWidth >= MIN_TERMINAL_WIDTH;
  terminalWidth--
) {
  const output = renderToString(
    <ProgressApp rows={[row]} now={NOW} tick={TICK} isTTY={true} terminalColumns={terminalWidth} />,
    { columns: terminalWidth },
  );
  console.log(output);
}
