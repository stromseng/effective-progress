import { Text } from "ink";
import { formatAmount } from "../format";
import type { ColumnProps } from "./types";

export const AmountColumn = ({ task, tick }: ColumnProps) => {
  const text = formatAmount(task, tick);
  const color =
    task.status === "failed"
      ? "red"
      : task.status === "done"
        ? "green"
        : task.units._tag === "DeterminateTaskUnits"
          ? "whiteBright"
          : "yellow";

  return <Text color={color}>{text}</Text>;
};
