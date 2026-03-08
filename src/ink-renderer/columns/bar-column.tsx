import { Text } from "ink";
import type { DeterminateTaskUnits, TaskSnapshot } from "../../types";
import type { TaskRowModel } from "../snapshot/types";
import type { ColumnPlanningContext } from "./planner";
import type { ColumnSpec } from "./spec";
import type { ColumnProps } from "./types";

interface BarColumnProps extends ColumnProps {
  readonly width: number;
}

const DEFAULT_BAR_WIDTH = 30;
const MIN_BAR_WIDTH = 8;

const segmentLengths = (width: number, total: number, succeeded: number, failed: number) => {
  if (total <= 0) {
    return { succeeded: 0, failed: 0, remaining: width };
  }

  const succeededEnd = Math.round((succeeded / total) * width);
  const failedEnd = Math.round(((succeeded + failed) / total) * width);

  const succeededLength = Math.max(0, Math.min(width, succeededEnd));
  const failedLength = Math.max(0, Math.min(width, failedEnd) - succeededLength);
  const remainingLength = Math.max(0, width - succeededLength - failedLength);

  return {
    succeeded: succeededLength,
    failed: failedLength,
    remaining: remainingLength,
  };
};

const BarColumn = ({ task, width }: BarColumnProps) => {
  if (task.units._tag !== "DeterminateTaskUnits") {
    return <Text />;
  }

  const barWidth = Math.max(1, Math.floor(width));
  const lengths = segmentLengths(
    barWidth,
    task.units.total,
    task.units.succeeded,
    task.units.failed,
  );

  return (
    <Text wrap="truncate-end">
      <Text color="green">{"━".repeat(lengths.succeeded)}</Text>
      <Text color="red">{"━".repeat(lengths.failed)}</Text>
      <Text color="gray">{"─".repeat(lengths.remaining)}</Text>
    </Text>
  );
};

const isDeterminate = (
  task: TaskSnapshot,
): task is TaskSnapshot & { readonly units: DeterminateTaskUnits } =>
  task.units._tag === "DeterminateTaskUnits";

const hasDeterminateRows = (rows: ReadonlyArray<TaskRowModel>): boolean =>
  rows.some((row) => isDeterminate(row.task));

export const createBarColumnSpec = (
  context: ColumnPlanningContext<TaskRowModel>,
  isTTY: boolean,
): ColumnSpec<TaskRowModel> | undefined => {
  if (!hasDeterminateRows(context.rows)) {
    return undefined;
  }

  return {
    id: "bar",
    grow: 0,
    canHide: true,
    variants: [
      {
        id: "full",
        minWidth: MIN_BAR_WIDTH,
        idealWidth: DEFAULT_BAR_WIDTH,
        maxWidth: DEFAULT_BAR_WIDTH,
        renderCell: (row, width) => (
          <BarColumn
            task={row.task}
            tree={row.tree}
            now={context.now}
            tick={context.tick}
            isTTY={isTTY}
            width={Math.max(1, Math.min(width, DEFAULT_BAR_WIDTH))}
          />
        ),
      },
      {
        id: "compact",
        minWidth: 1,
        idealWidth: MIN_BAR_WIDTH,
        maxWidth: MIN_BAR_WIDTH,
        renderCell: (row, width) => (
          <BarColumn
            task={row.task}
            tree={row.tree}
            now={context.now}
            tick={context.tick}
            isTTY={isTTY}
            width={Math.max(1, width)}
          />
        ),
      },
    ],
  };
};
