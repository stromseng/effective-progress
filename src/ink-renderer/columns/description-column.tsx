import { Text } from "ink";
import { getTaskIndicator } from "../format";
import { renderTreePrefix } from "../tree";
import type { ColumnProps } from "./types";

export interface DescriptionColumnProps extends ColumnProps {
  readonly showTree: boolean;
}

export const DescriptionColumn = ({ task, tree, showTree, tick }: DescriptionColumnProps) => {
  const treePrefix = showTree ? renderTreePrefix(tree) : "";
  const indicator = getTaskIndicator(task, tick);

  return (
    <Text wrap="truncate-end">
      {treePrefix}
      <Text color={indicator.color}>{indicator.symbol}</Text>
      {` ${task.description}`}
    </Text>
  );
};
