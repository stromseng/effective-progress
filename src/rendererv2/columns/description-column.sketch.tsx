import { Text } from "ink";
import type {
  ProgressColumnDefinition,
  ProgressColumnMeasurement,
  ProgressColumnProps,
} from "../public-api.sketch";

export interface DescriptionColumnConfig {
  readonly minWidth: number;
  readonly paddingRight: number;
  readonly sticky: boolean;
  readonly stickyMaxWidth?: number;
}

export const createDescriptionColumn = (
  config: DescriptionColumnConfig,
): ProgressColumnDefinition => {
  const Component = ({ row, width }: ProgressColumnProps) => {
    const showTree = width >= row.derived.treePrefixWidth + 6;
    const content = showTree
      ? `${row.derived.treePrefix}${row.task.description}`
      : row.task.description;

    return <Text wrap="truncate-end">{content}</Text>;
  };

  return {
    Component,
    measure: (rows: ReadonlyArray<ProgressColumnProps["row"]>): ProgressColumnMeasurement => ({
      minWidth: config.minWidth,
      preferredWidth: rows.reduce(
        (max, row) => Math.max(max, row.derived.treePrefixedDescriptionWidth),
        config.minWidth,
      ),
      maxWidth: undefined,
    }),
    paddingRight: config.paddingRight,
    noWrap: false,
    sticky: config.sticky,
    stickyMaxWidth: config.stickyMaxWidth,
  };
};
