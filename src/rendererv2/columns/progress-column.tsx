import { Box, Text } from "ink";
import type { ReactNode } from "react";
import { isDeterminate } from "../shared/determinate";
import { formatAmount } from "../shared/format";
import { DEFAULT_BAR_WIDTH, percentText } from "../shared/progress";
import { textWidth } from "../shared/text-width";
import type {
  ProgressColumnDefinition,
  ProgressColumnMeasurement,
  ProgressColumnProps,
} from "../public-api";

interface ProgressColumnConfig {
  readonly minWidth: number;
  readonly barWidth: number;
  readonly sticky: boolean;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const progressAmountWidth = (rows: ReadonlyArray<ProgressColumnProps["row"]>): number =>
  rows.reduce((max, row) => Math.max(max, textWidth(formatAmount(row.task, 0))), 1);

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

export const defaultProgressColumnConfig = {
  minWidth: 4,
  barWidth: DEFAULT_BAR_WIDTH,
  sticky: true,
} satisfies ProgressColumnConfig;

export const createProgressColumn = (
  config?: Partial<ProgressColumnConfig>,
): ProgressColumnDefinition => {
  const resolvedConfig = {
    ...defaultProgressColumnConfig,
    ...config,
  } satisfies ProgressColumnConfig;
  const Component = ({ row, width }: ProgressColumnProps) => {
    const amount = formatAmount(row.task, 0);
    const percent = percentText(row.task);

    if (width < 5) {
      return <Text wrap="truncate-end">{percent}</Text>;
    }

    if (!row.derived.isDeterminate || width < textWidth(amount) + 6) {
      return <Text wrap="truncate-end">{width >= textWidth(amount) ? amount : percent}</Text>;
    }

    const amountWidth = Math.min(textWidth(amount), Math.max(1, width - 5));
    const barWidth = Math.max(4, width - amountWidth - 1);

    if (barWidth + 1 + amountWidth > width) {
      return <Text wrap="truncate-end">{amount}</Text>;
    }

    return (
      <Box width={width}>
        <Text wrap="truncate-end">{renderProgressBar(row.task, barWidth)}</Text>
        <Text>{` `}</Text>
        <Text wrap="truncate-end">{amount}</Text>
      </Box>
    );
  };

  return {
    Component,
    measure: ({ rows }): ProgressColumnMeasurement => {
      const amountWidth = progressAmountWidth(rows);
      const percentWidth = rows.reduce(
        (max, row) => Math.max(max, textWidth(percentText(row.task))),
        3,
      );
      const hasDeterminateRows = rows.some((row) => row.derived.isDeterminate);
      const preferredWidth = hasDeterminateRows
        ? Math.max(percentWidth, amountWidth + 1 + resolvedConfig.barWidth)
        : Math.max(percentWidth, amountWidth);

      return {
        minWidth: Math.min(percentWidth, resolvedConfig.minWidth),
        preferredWidth,
        maxWidth: preferredWidth,
      };
    },
    noWrap: false,
    sticky: resolvedConfig.sticky,
  };
};
