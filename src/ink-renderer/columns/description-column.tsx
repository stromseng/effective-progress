import { Text } from "ink";
import { renderTreePrefix } from "../tree";
import type { ColumnProps } from "./types";

export const DescriptionColumn = ({ task, tree, showTree }: ColumnProps) => (
  <Text wrap="truncate-end">{`${showTree ? renderTreePrefix(tree) : ""}${task.description}`}</Text>
);
