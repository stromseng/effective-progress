import { Text } from "ink";
import { memo } from "react";
import type { CellInfo } from "../../../types";
import { isDeterminate } from "../shared/determinate";
import type { TaskRowModel } from "../../store/types";

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export interface BarPrepared {
  readonly hasDeterminateRows: boolean;
}

export const prepareBar = (rows: ReadonlyArray<CellInfo<unknown>>): BarPrepared => {
  return {
    hasDeterminateRows: rows.some((row) => row.derived.isDeterminate),
  };
};

const ProgressBarSegments = ({
  task,
  width,
}: {
  readonly task: TaskRowModel["task"];
  readonly width: number;
}) => {
  if (!isDeterminate(task)) {
    return <Text>{` `.repeat(Math.max(0, width))}</Text>;
  }

  const displayTotal = Math.max(task.units.total, task.units.succeeded + task.units.failed);
  const succeededEnd =
    displayTotal === 0 ? width : Math.round((task.units.succeeded / displayTotal) * width);
  const failedEnd =
    displayTotal === 0
      ? width
      : Math.round(((task.units.succeeded + task.units.failed) / displayTotal) * width);
  const succeededLength = clamp(succeededEnd, 0, width);
  const failedLength = clamp(failedEnd, succeededLength, width) - succeededLength;
  const remainingLength = Math.max(0, width - succeededLength - failedLength);

  return (
    <Text wrap="truncate-end">
      <Text color="green">{"━".repeat(succeededLength)}</Text>
      <Text color="red">{"━".repeat(failedLength)}</Text>
      <Text color="gray">{"─".repeat(remainingLength)}</Text>
    </Text>
  );
};

export const BarCell = memo(
  ({ task, width }: { readonly task: TaskRowModel["task"]; readonly width?: number }) => (
    <Text wrap="truncate-end">
      <ProgressBarSegments task={task} width={width ?? 0} />
    </Text>
  ),
);
