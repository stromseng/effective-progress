import { Text } from "ink";
import type { ReactNode } from "react";
import { isDeterminate } from "../shared/determinate";
import type {
  ProgressColumnDefinition,
  ProgressColumnMeasurement,
  ProgressColumnProps,
} from "../public-api";

interface BarColumnConfig {
  readonly minWidth: number;
  readonly barWidth: number;
  readonly sticky: boolean;
}

const DEFAULT_BAR_WIDTH = 30;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const renderProgressBar = (task: ProgressColumnProps["row"]["task"], width: number): ReactNode => {
  if (!isDeterminate(task)) {
    return <Text>{` `.repeat(Math.max(0, width))}</Text>;
  }

  const displayTotal = Math.max(task.units.total, task.units.succeeded + task.units.failed);
  const succeededEnd =
    displayTotal === 0 ? width : Math.round((task.units.succeeded / displayTotal) * width);
  const failedEnd =
    displayTotal === 0
      ? width
      : Math.round(((task.units.succeeded + task.units.failed) / displayTotal) * width);
  const succeededLength = clamp(succeededEnd, 0, width);
  const failedLength = clamp(failedEnd, succeededLength, width) - succeededLength;
  const remainingLength = Math.max(0, width - succeededLength - failedLength);

  return (
    <Text wrap="truncate-end">
      <Text color="green">{"━".repeat(succeededLength)}</Text>
      <Text color="red">{"━".repeat(failedLength)}</Text>
      <Text color="gray">{"─".repeat(remainingLength)}</Text>
    </Text>
  );
};

export const defaultBarColumnConfig = {
  minWidth: 4,
  barWidth: DEFAULT_BAR_WIDTH,
  sticky: true,
} satisfies BarColumnConfig;

export const createBarColumn = (config?: Partial<BarColumnConfig>): ProgressColumnDefinition => {
  const resolvedConfig = {
    ...defaultBarColumnConfig,
    ...config,
  } satisfies BarColumnConfig;

  return {
    Component: ({ row, width }: ProgressColumnProps) => (
      <Text wrap="truncate-end">{renderProgressBar(row.task, width)}</Text>
    ),
    measure: ({ rows }): ProgressColumnMeasurement => {
      const hasDeterminateRows = rows.some((row) => row.derived.isDeterminate);
      const preferredWidth = hasDeterminateRows ? resolvedConfig.barWidth : 0;

      return {
        minWidth: hasDeterminateRows ? Math.min(resolvedConfig.minWidth, preferredWidth) : 0,
        preferredWidth,
        maxWidth: preferredWidth,
      };
    },
    noWrap: false,
    sticky: resolvedConfig.sticky,
  };
};
