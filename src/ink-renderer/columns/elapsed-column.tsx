import { Text } from "ink";
import { formatElapsed } from "../format";
import type { ColumnProps } from "./types";

export const ElapsedColumn = ({ task, now }: ColumnProps) => (
  <Text color="gray">{formatElapsed(task, now)}</Text>
);
