import { Box } from "ink";
import { computeFrameLayout } from "./columns/frame-plan";
import { TaskRow } from "./task-row";
import type { TaskRowModel } from "./types";

export interface ProgressAppProps {
  readonly rows: ReadonlyArray<TaskRowModel>;
  readonly now: number;
  readonly tick: number;
  readonly isTTY: boolean;
  readonly terminalColumns?: number;
}

export const ProgressApp = ({ rows, now, tick, isTTY, terminalColumns }: ProgressAppProps) => {
  const layout = computeFrameLayout(rows, now, tick, terminalColumns, isTTY);

  return (
    <Box flexDirection="column">
      {rows.map((row) => (
        <TaskRow key={row.task.id as number} row={row} layout={layout} />
      ))}
    </Box>
  );
};
