import { Text } from "ink";
import type {
  ProgressColumnDefinition,
  ProgressColumnMeasurement,
  ProgressColumnProps,
} from "../public-api";

export interface DescriptionColumnConfig {
  readonly minWidth: number;
  readonly paddingRight: number;
  readonly sticky: boolean;
  readonly stickyMaxWidth?: number;
}

const MIN_TREE_DESCRIPTION_TEXT_WIDTH = 6;

export const createDescriptionColumn = (
  config: DescriptionColumnConfig,
): ProgressColumnDefinition => {
  let minTreeWidth = MIN_TREE_DESCRIPTION_TEXT_WIDTH;

  const Component = ({ row, width }: ProgressColumnProps) => {
    const showTree = width >= minTreeWidth;
    const content = showTree
      ? `${row.derived.treePrefix}${row.task.description}`
      : row.task.description;

    return <Text wrap="truncate-end">{content}</Text>;
  };

  return {
    Component,
    measure: (rows: ReadonlyArray<ProgressColumnProps["row"]>): ProgressColumnMeasurement => {
      minTreeWidth = rows.reduce(
        (max, row) =>
          Math.max(max, row.derived.treePrefixWidth + MIN_TREE_DESCRIPTION_TEXT_WIDTH),
        MIN_TREE_DESCRIPTION_TEXT_WIDTH,
      );

      return {
        minWidth: config.minWidth,
        preferredWidth: rows.reduce(
          (max, row) => Math.max(max, row.derived.treePrefixedDescriptionWidth),
          config.minWidth,
        ),
        maxWidth: undefined,
      };
    },
    paddingRight: config.paddingRight,
    noWrap: false,
    sticky: config.sticky,
    stickyMaxWidth: config.stickyMaxWidth,
  };
};
