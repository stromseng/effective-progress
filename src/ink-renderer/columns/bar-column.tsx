import { Text } from "ink";
import type { ColumnProps } from "./types";

export interface BarColumnProps extends ColumnProps {
  readonly width: number;
}

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

export const BarColumn = ({ task, width }: BarColumnProps) => {
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
