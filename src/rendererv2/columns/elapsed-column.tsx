import { Text } from "ink";
import { useNow } from "../../ink-renderer/now-context";
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

const ElapsedText = ({ task, width }: Pick<ProgressColumnProps, "width"> & { readonly task: ProgressColumnProps["row"]["task"] }) => {
  const now = useNow();

  return (
    <Text wrap="truncate-end" color="gray">
      {formatElapsed(task, now).slice(0, Math.max(0, width))}
    </Text>
  );
};

export const createElapsedColumn = (config: ElapsedColumnConfig): ProgressColumnDefinition => {
  const Component = ({ row, width }: ProgressColumnProps) => (
    <ElapsedText task={row.task} width={width} />
  );

  return {
    Component,
    measure: ({ rows, now }): ProgressColumnMeasurement => ({
      minWidth: config.minWidth,
      preferredWidth: rows.reduce(
        (max, row) => Math.max(max, textWidth(formatElapsed(row.task, now))),
        config.minWidth,
      ),
      maxWidth: rows.reduce(
        (max, row) => Math.max(max, textWidth(formatElapsed(row.task, now))),
        config.minWidth,
      ),
    }),
    justify: config.justify,
    noWrap: true,
    sticky: config.sticky,
  };
};
