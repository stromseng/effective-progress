import { Box } from "ink";
import { computeSharedColumnWidths } from "./layout";
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
  const widths = computeSharedColumnWidths(rows, now, tick, terminalColumns);

  return (
    <Box flexDirection="column">
      {rows.map((row) => (
        <TaskRow
          key={row.task.id as number}
          row={row}
          now={now}
          tick={tick}
          isTTY={isTTY}
          widths={widths}
        />
      ))}
    </Box>
  );
};
