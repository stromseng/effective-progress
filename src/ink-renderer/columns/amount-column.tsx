import { Box, Text } from "ink";
import { formatAmount } from "../format";
import type { ColumnProps } from "./types";

const padLeft = (value: string, width: number): string => value.padStart(Math.max(0, width), " ");
const padRight = (value: string, width: number): string => value.padEnd(Math.max(0, width), " ");
const blank = (width: number): string => " ".repeat(Math.max(0, width));

const shouldShowDetailedCounts = (task: ColumnProps["task"]): boolean =>
  task.units._tag === "DeterminateTaskUnits" && task.countDisplay === "detailed";

interface AmountCountProps {
  readonly task: ColumnProps["task"];
  readonly width: number;
}

const SucceededCountColumn = ({ task, width }: AmountCountProps) => {
  if (width <= 0) return null;
  if (task.units._tag !== "DeterminateTaskUnits") return <Text>{blank(width)}</Text>;

  if (!shouldShowDetailedCounts(task)) {
    return <Text>{blank(width)}</Text>;
  }

  return <Text color="green">{padLeft(`${task.units.succeeded}`, width)}</Text>;
};

const FailedCountColumn = ({ task, width }: AmountCountProps) => {
  if (width <= 0) return null;
  if (task.units._tag !== "DeterminateTaskUnits") return <Text>{blank(width)}</Text>;

  if (!shouldShowDetailedCounts(task)) {
    return <Text>{blank(width)}</Text>;
  }

  return <Text color="red">{padLeft(`${task.units.failed}`, width)}</Text>;
};

const ProcessedCountColumn = ({ task, width }: AmountCountProps) => {
  if (width <= 0) return null;
  if (task.units._tag !== "DeterminateTaskUnits") return <Text>{blank(width)}</Text>;

  return <Text>{padLeft(`${task.units.processed}`, width)}</Text>;
};

interface AmountSeparatorProps {
  readonly task: ColumnProps["task"];
  readonly showStructured: boolean;
  readonly tick: number;
}

const AmountSeparatorColumn = ({ task, showStructured, tick }: AmountSeparatorProps) => {
  if (!showStructured) {
    return null;
  }

  if (task.units._tag === "DeterminateTaskUnits") {
    return <Text>/</Text>;
  }

  const symbol = formatAmount(task, tick);
  if (task.status === "failed") {
    return <Text color="red">{symbol}</Text>;
  }
  if (task.status === "running") {
    return <Text color="yellow">{symbol}</Text>;
  }
  return <Text>{symbol}</Text>;
};

const TotalCountColumn = ({ task, width }: AmountCountProps) => {
  if (width <= 0) return null;
  if (task.units._tag !== "DeterminateTaskUnits") return <Text>{blank(width)}</Text>;
  return <Text>{padRight(`${task.units.total}`, width)}</Text>;
};

export const AmountColumn = ({
  task,
  tick,
  amountSucceededWidth,
  amountFailedWidth,
  amountProcessedWidth,
  amountTotalWidth,
}: ColumnProps) => {
  const showStructured = amountProcessedWidth > 0 && amountTotalWidth > 0;

  if (!showStructured) {
    const text = formatAmount(task, tick);
    if (task.status === "failed") {
      return (
        <Text wrap="truncate-end" color="red">
          {text}
        </Text>
      );
    }
    if (task.status === "running") {
      return (
        <Text wrap="truncate-end" color="yellow">
          {text}
        </Text>
      );
    }
    return <Text wrap="truncate-end">{text}</Text>;
  }

  return (
    <Box flexDirection="row">
      {amountSucceededWidth > 0 ? (
        <>
          <SucceededCountColumn task={task} width={amountSucceededWidth} />
          <Text>{` `}</Text>
        </>
      ) : null}
      {amountFailedWidth > 0 ? (
        <>
          <FailedCountColumn task={task} width={amountFailedWidth} />
          <Text>{` `}</Text>
        </>
      ) : null}
      <ProcessedCountColumn task={task} width={amountProcessedWidth} />
      <AmountSeparatorColumn task={task} showStructured={showStructured} tick={tick} />
      <TotalCountColumn task={task} width={amountTotalWidth} />
    </Box>
  );
};
