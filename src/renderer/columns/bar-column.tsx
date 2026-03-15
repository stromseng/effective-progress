import { Box, Text, useBoxMetrics, type DOMElement } from "ink";
import { useRef } from "react";
import type { ReactNode } from "react";
import { isDeterminate } from "../shared/determinate";
import type { TaskRowModel } from "../store/types";

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const renderProgressBar = (task: TaskRowModel["task"], width: number): ReactNode => {
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

export const BarColumn = ({ rows }: { readonly rows: ReadonlyArray<TaskRowModel> }) => {
  const ref = useRef<DOMElement>(null);
  const { width, hasMeasured } = useBoxMetrics(ref);
  const hasDeterminateRows = rows.some((row) => row.derived.isDeterminate);

  if (!hasDeterminateRows) {
    return null;
  }

  return (
    <Box ref={ref} flexDirection="column" flexShrink={1} flexBasis={30} minWidth={4}>
      {rows.map((row) => (
        <Box key={row.task.id as number} height={1}>
          <Text wrap="truncate-end">{renderProgressBar(row.task, hasMeasured ? width : 0)}</Text>
        </Box>
      ))}
    </Box>
  );
};
