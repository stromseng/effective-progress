import { Box, Text } from "ink";
import { isDeterminate } from "../../ink-renderer/shared/determinate";
import { formatAmount } from "../../ink-renderer/shared/format";
import { DEFAULT_BAR_WIDTH, percentText } from "../../ink-renderer/shared/progress";
import { textWidth } from "../../ink-renderer/shared/text-width";
import type {
  ProgressColumnDefinition,
  ProgressColumnMeasurement,
  ProgressColumnProps,
} from "../public-api";

export interface ProgressColumnConfig {
  readonly minWidth: number;
  readonly barWidth: number;
  readonly paddingRight: number;
  readonly sticky: boolean;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const progressAmountWidth = (rows: ReadonlyArray<ProgressColumnProps["row"]>): number =>
  rows.reduce((max, row) => Math.max(max, textWidth(formatAmount(row.task, 0))), 1);

const renderProgressBar = (task: ProgressColumnProps["row"]["task"], width: number) => {
  if (!isDeterminate(task)) {
    return " ".repeat(Math.max(0, width));
  }

  const total = Math.max(task.units.total, task.units.processed);
  if (total <= 0) {
    return "━".repeat(Math.max(0, width));
  }

  const completed = clamp(Math.round((task.units.processed / total) * width), 0, width);
  const remaining = Math.max(0, width - completed);

  return `${"━".repeat(completed)}${"─".repeat(remaining)}`;
};

export const defaultProgressColumnConfig = {
  minWidth: 4,
  barWidth: DEFAULT_BAR_WIDTH,
  paddingRight: 2,
  sticky: true,
} satisfies ProgressColumnConfig;

export const createProgressColumn = (config: ProgressColumnConfig): ProgressColumnDefinition => {
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
    measure: (rows: ReadonlyArray<ProgressColumnProps["row"]>): ProgressColumnMeasurement => {
      const amountWidth = progressAmountWidth(rows);
      const percentWidth = rows.reduce(
        (max, row) => Math.max(max, textWidth(percentText(row.task))),
        3,
      );
      const hasDeterminateRows = rows.some((row) => row.derived.isDeterminate);
      const preferredWidth = hasDeterminateRows
        ? Math.max(percentWidth, amountWidth + 1 + config.barWidth)
        : Math.max(percentWidth, amountWidth);

      return {
        minWidth: Math.min(percentWidth, config.minWidth),
        preferredWidth,
        maxWidth: preferredWidth,
      };
    },
    paddingRight: config.paddingRight,
    noWrap: false,
    sticky: config.sticky,
  };
};
