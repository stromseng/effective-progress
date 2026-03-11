import { Text } from "ink";
import { formatElapsed } from "../../ink-renderer/shared/format";
import { textWidth } from "../../ink-renderer/shared/text-width";
import type {
  ProgressColumnDefinition,
  ProgressColumnMeasurement,
  ProgressColumnProps,
} from "../public-api";

export interface ElapsedColumnConfig {
  readonly minWidth: number;
  readonly justify: "left" | "right";
  readonly sticky: boolean;
}

export const createElapsedColumn = (config: ElapsedColumnConfig): ProgressColumnDefinition => {
  const Component = ({ row, now, width }: ProgressColumnProps) => (
    <Text wrap="truncate-end" color="gray">
      {formatElapsed(row.task, now).slice(0, Math.max(0, width))}
    </Text>
  );

  return {
    Component,
    measure: (rows: ReadonlyArray<ProgressColumnProps["row"]>): ProgressColumnMeasurement => ({
      minWidth: config.minWidth,
      preferredWidth: rows.reduce(
        (max, row) => Math.max(max, textWidth(formatElapsed(row.task, Date.now()))),
        config.minWidth,
      ),
      maxWidth: rows.reduce(
        (max, row) => Math.max(max, textWidth(formatElapsed(row.task, Date.now()))),
        config.minWidth,
      ),
    }),
    justify: config.justify,
    noWrap: true,
    sticky: config.sticky,
  };
};
