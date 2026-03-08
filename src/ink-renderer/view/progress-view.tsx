import { Box } from "ink";
import { computeFrameLayout } from "../columns/layout";
import type { TaskRowModel } from "../snapshot/types";
import { TaskRow } from "./task-row";

export interface ProgressViewProps {
  readonly rows: ReadonlyArray<TaskRowModel>;
  readonly now: number;
  readonly tick: number;
  readonly isTTY: boolean;
  readonly terminalColumns?: number;
}

export const ProgressView = ({ rows, now, tick, isTTY, terminalColumns }: ProgressViewProps) => {
  const layout = computeFrameLayout(rows, now, tick, terminalColumns, isTTY);

  return (
    <Box flexDirection="column">
      {rows.map((row) => (
        <TaskRow key={row.task.id as number} row={row} layout={layout} />
      ))}
    </Box>
  );
};
