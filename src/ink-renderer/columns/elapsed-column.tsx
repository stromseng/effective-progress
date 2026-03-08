import { Text } from "ink";
import { formatElapsed } from "../format";
import type { TaskRowModel } from "../snapshot/types";
import { hasDeterminateRows } from "./determinate";
import type { ColumnPlanningContext } from "./planner";
import type { ColumnSpec } from "./spec";
import { textWidth } from "./spec";
import type { ColumnProps } from "./types";

const ElapsedColumn = ({ task, now }: ColumnProps) => (
  <Text wrap="truncate-end" color="gray">
    {formatElapsed(task, now)}
  </Text>
);

const MIN_ELAPSED_WIDTH = 2;
const RESERVED_ELAPSED_WIDTH_UP_TO_ONE_HOUR = Array.from("59m 59s").length;

const maxElapsedWidth = (rows: ReadonlyArray<TaskRowModel>, now: number): number =>
  rows.reduce(
    (max, row) => Math.max(max, textWidth(formatElapsed(row.task, now))),
    MIN_ELAPSED_WIDTH,
  );

export const createElapsedColumnSpec = (
  context: ColumnPlanningContext<TaskRowModel>,
  isTTY: boolean,
): ColumnSpec<TaskRowModel> => {
  const elapsedContentWidth = maxElapsedWidth(context.rows, context.now);
  const hasDeterminate = hasDeterminateRows(context.rows);

  return {
    id: "elapsed",
    grow: 0,
    canHide: false,
    variants: [
      {
        id: "stable",
        minWidth: elapsedContentWidth,
        idealWidth: hasDeterminate
          ? Math.max(elapsedContentWidth, RESERVED_ELAPSED_WIDTH_UP_TO_ONE_HOUR)
          : elapsedContentWidth,
        renderCell: (row) => (
          <ElapsedColumn
            task={row.task}
            tree={row.tree}
            now={context.now}
            tick={context.tick}
            isTTY={isTTY}
          />
        ),
      },
      {
        id: "compact",
        minWidth: MIN_ELAPSED_WIDTH,
        idealWidth: elapsedContentWidth,
        renderCell: (row) => (
          <ElapsedColumn
            task={row.task}
            tree={row.tree}
            now={context.now}
            tick={context.tick}
            isTTY={isTTY}
          />
        ),
      },
    ],
  };
};
