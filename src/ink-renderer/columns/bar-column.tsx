import { Text } from "ink";
import type { ColumnProps } from "./types";

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(Math.max(value, minimum), maximum);

export interface BarColumnProps extends ColumnProps {
  readonly width: number;
}

export const BarColumn = ({ task, width }: BarColumnProps) => {
  if (task.units._tag !== "DeterminateTaskUnits") {
    return <Text />;
  }

  const barWidth = Math.max(1, Math.floor(width));
  const safeTotal = Math.max(1, task.units.total);
  const ratio = task.status === "done" ? 1 : clamp(task.units.completed / safeTotal, 0, 1);
  const filled = Math.round(barWidth * ratio);
  const empty = Math.max(0, barWidth - filled);
  const bar = `${"━".repeat(filled)}${"─".repeat(empty)}`;

  const color =
    task.status === "failed" ? "red" : task.status === "done" ? "green" : "blue";

  return (
    <Text wrap="truncate-end" color={color}>
      {bar}
    </Text>
  );
};
