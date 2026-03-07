import { Text } from "ink";
import { getTaskIndicator } from "../format";
import { renderTreePrefix } from "../tree";
import type { TaskRowModel } from "../types";
import type { ColumnPlanningContext } from "./planner";
import type { ColumnSpec } from "./spec";
import { textWidth } from "./spec";
import type { ColumnProps } from "./types";

interface DescriptionColumnProps extends ColumnProps {
  readonly showTree: boolean;
}

const DescriptionColumn = ({ task, tree, showTree, tick }: DescriptionColumnProps) => {
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

const MIN_DESCRIPTION_WIDTH = 8;
const MIN_DESCRIPTION_WITH_TREE_WIDTH = 20;
const DESCRIPTION_PADDING_GROWTH_LIMIT = 20;

const maxDescriptionWidth = (rows: ReadonlyArray<TaskRowModel>, showTree: boolean): number =>
  rows.reduce((max, row) => {
    const treePrefix = showTree ? renderTreePrefix(row.tree) : "";
    return Math.max(max, textWidth(`${treePrefix}${row.task.description}`) + 2);
  }, MIN_DESCRIPTION_WIDTH);

export const createDescriptionColumnSpec = (
  context: ColumnPlanningContext<TaskRowModel>,
  isTTY: boolean,
): ColumnSpec<TaskRowModel> => {
  const treeIdeal = maxDescriptionWidth(context.rows, true);
  const plainIdeal = maxDescriptionWidth(context.rows, false);
  const treeVariantIdeal = Math.max(MIN_DESCRIPTION_WITH_TREE_WIDTH, treeIdeal);
  const plainVariantIdeal = Math.max(MIN_DESCRIPTION_WIDTH, plainIdeal);

  return {
    id: "description",
    grow: 1,
    canHide: false,
    variants: [
      {
        id: "tree",
        minWidth: MIN_DESCRIPTION_WITH_TREE_WIDTH,
        idealWidth: treeVariantIdeal,
        maxWidth: Math.max(DESCRIPTION_PADDING_GROWTH_LIMIT, treeVariantIdeal),
        renderCell: (row) => (
          <DescriptionColumn
            task={row.task}
            tree={row.tree}
            now={context.now}
            tick={context.tick}
            isTTY={isTTY}
            showTree={true}
          />
        ),
      },
      {
        id: "plain",
        minWidth: MIN_DESCRIPTION_WIDTH,
        idealWidth: plainVariantIdeal,
        maxWidth: Math.max(DESCRIPTION_PADDING_GROWTH_LIMIT, plainVariantIdeal),
        renderCell: (row) => (
          <DescriptionColumn
            task={row.task}
            tree={row.tree}
            now={context.now}
            tick={context.tick}
            isTTY={isTTY}
            showTree={false}
          />
        ),
      },
    ],
  };
};
