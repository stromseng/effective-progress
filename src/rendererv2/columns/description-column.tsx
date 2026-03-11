import { Text } from "ink";
import type {
  ProgressColumnDefinition,
  ProgressColumnMeasurement,
  ProgressColumnProps,
} from "../public-api";
import { TaskIndicatorGlyph } from "./task-indicator";

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
  let minTreeWidth = MIN_TREE_DESCRIPTION_TEXT_WIDTH + 2;

  const Component = ({ row, width }: ProgressColumnProps) => {
    const showTree = width >= minTreeWidth;
    const treePrefix = showTree ? row.derived.treePrefix : "";

    return (
      <Text wrap="truncate-end">
        {treePrefix}
        <TaskIndicatorGlyph task={row.task} />
        {` ${row.task.description}`}
      </Text>
    );
  };

  return {
    Component,
    measure: (rows: ReadonlyArray<ProgressColumnProps["row"]>): ProgressColumnMeasurement => {
      const hasNestedRows = rows.some((row) => row.tree.depth > 0);

      minTreeWidth = rows.reduce(
        (max, row) =>
          Math.max(max, row.derived.treePrefixWidth + 2 + MIN_TREE_DESCRIPTION_TEXT_WIDTH),
        MIN_TREE_DESCRIPTION_TEXT_WIDTH + 2,
      );

      return {
        minWidth: config.minWidth,
        preferredWidth: Math.max(
          rows.reduce(
            (max, row) => Math.max(max, row.derived.treePrefixedDescriptionWidth + 2),
            config.minWidth,
          ),
          hasNestedRows ? minTreeWidth : config.minWidth,
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
