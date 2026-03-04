import { Box, Text } from "ink";
import { formatAmount } from "../format";
import type { TaskSnapshot } from "../../types";

const padLeft = (value: string, width: number): string => value.padStart(Math.max(0, width), " ");
const padRight = (value: string, width: number): string => value.padEnd(Math.max(0, width), " ");
const blank = (width: number): string => " ".repeat(Math.max(0, width));

const shouldShowDetailedCounts = (task: TaskSnapshot): boolean =>
  task.units._tag === "DeterminateTaskUnits" && task.countDisplay === "detailed";

interface AmountCountProps {
  readonly task: TaskSnapshot;
  readonly width: number;
}

const SucceededCountColumn = ({ task, width }: AmountCountProps) => {
  if (width <= 0) return null;
  if (task.units._tag !== "DeterminateTaskUnits") return <Text>{blank(width)}</Text>;
  if (!shouldShowDetailedCounts(task)) return <Text>{blank(width)}</Text>;
  return <Text color="green">{padLeft(`${task.units.succeeded}`, width)}</Text>;
};

const FailedCountColumn = ({ task, width }: AmountCountProps) => {
  if (width <= 0) return null;
  if (task.units._tag !== "DeterminateTaskUnits") return <Text>{blank(width)}</Text>;
  if (!shouldShowDetailedCounts(task)) return <Text>{blank(width)}</Text>;
  return <Text color="red">{padLeft(`${task.units.failed}`, width)}</Text>;
};

const ProcessedCountColumn = ({ task, width }: AmountCountProps) => {
  if (width <= 0) return null;
  if (task.units._tag !== "DeterminateTaskUnits") return <Text>{blank(width)}</Text>;
  return <Text>{padLeft(`${task.units.processed}`, width)}</Text>;
};

interface AmountSeparatorProps {
  readonly task: TaskSnapshot;
  readonly tick: number;
}

const AmountSeparatorColumn = ({ task, tick }: AmountSeparatorProps) => {
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

export interface StructuredAmountLayout {
  readonly kind: "structured";
  readonly succeededWidth: number;
  readonly failedWidth: number;
  readonly processedWidth: number;
  readonly totalWidth: number;
}

export interface TextAmountLayout {
  readonly kind: "text";
}

export type AmountLayout = StructuredAmountLayout | TextAmountLayout;

export interface AmountColumnProps {
  readonly task: TaskSnapshot;
  readonly tick: number;
  readonly layout: AmountLayout;
}

export const AmountColumn = ({ task, tick, layout }: AmountColumnProps) => {
  if (layout.kind === "text") {
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
      {layout.succeededWidth > 0 ? (
        <>
          <SucceededCountColumn task={task} width={layout.succeededWidth} />
          <Text>{` `}</Text>
        </>
      ) : null}
      {layout.failedWidth > 0 ? (
        <>
          <FailedCountColumn task={task} width={layout.failedWidth} />
          <Text>{` `}</Text>
        </>
      ) : null}
      <ProcessedCountColumn task={task} width={layout.processedWidth} />
      <AmountSeparatorColumn task={task} tick={tick} />
      <TotalCountColumn task={task} width={layout.totalWidth} />
    </Box>
  );
};
