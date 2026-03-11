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
export const defaultElapsedColumnConfig = {
  minWidth: 2,
  justify: "right",
  sticky: true,
} satisfies ElapsedColumnConfig;

const ElapsedText = ({
  task,
  width,
}: Pick<ProgressColumnProps, "width"> & { readonly task: ProgressColumnProps["row"]["task"] }) => {
  const now = useNow();

  return (
    <Text wrap="truncate-end" color="gray">
      {formatElapsed(task, now).slice(0, Math.max(0, width))}
    </Text>
  );
};

export const createElapsedColumn = (
  config?: Partial<ElapsedColumnConfig>,
): ProgressColumnDefinition => {
  const resolvedConfig = {
    ...defaultElapsedColumnConfig,
    ...config,
  } satisfies ElapsedColumnConfig;
  const Component = ({ row, width }: ProgressColumnProps) => (
    <ElapsedText task={row.task} width={width} />
  );

  return {
    Component,
    measure: ({ rows, now }): ProgressColumnMeasurement => {
      const width = rows.reduce(
        (max, row) => Math.max(max, textWidth(formatElapsed(row.task, now))),
        resolvedConfig.minWidth,
      );

      return {
        minWidth: resolvedConfig.minWidth,
        preferredWidth: width,
        maxWidth: width,
      };
    },
    getLayoutDependency: ({ rows, now }) =>
      rows.reduce((max, row) => Math.max(max, textWidth(formatElapsed(row.task, now))), 0),
    justify: resolvedConfig.justify,
    noWrap: true,
    sticky: resolvedConfig.sticky,
  };
};
