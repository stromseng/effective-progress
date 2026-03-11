import { Text } from "ink";
import { getTaskIndicator, getSpinnerIndicator } from "../../ink-renderer/shared/format";
import type { ProgressColumnDefinition, ProgressColumnProps } from "../public-api";

export interface StatusColumnConfig {
  readonly width: number;
  readonly paddingRight: number;
}

export const createStatusColumn = (config: StatusColumnConfig): ProgressColumnDefinition => {
  const Component = ({ row, tick }: ProgressColumnProps) => {
    const indicator =
      row.task.status === "running" ? getSpinnerIndicator(tick) : getTaskIndicator(row.task, tick);

    return <Text color={indicator.color}>{indicator.symbol}</Text>;
  };

  return {
    Component,
    measure: () => ({
      minWidth: config.width,
      preferredWidth: config.width,
      maxWidth: config.width,
    }),
    fixedWidth: config.width,
    paddingRight: config.paddingRight,
    noWrap: true,
  };
};
