import { Box, Text } from "ink";
import { formatAmount } from "../format";
import type { TaskSnapshot } from "../../types";
import type { TaskRowModel } from "../snapshot/types";
import { isDeterminate } from "./determinate";
import type { ColumnPlanningContext } from "./planner";
import type { ColumnSpec } from "./spec";
import { textWidth } from "./spec";

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

interface DetailedAmountLayout {
  readonly kind: "detailed";
  readonly succeededWidth: number;
  readonly failedWidth: number;
  readonly processedWidth: number;
  readonly totalWidth: number;
}

interface ProcessedAmountLayout {
  readonly kind: "processed";
  readonly processedWidth: number;
  readonly totalWidth: number;
}

interface TextAmountLayout {
  readonly kind: "text";
}

type AmountLayout = DetailedAmountLayout | ProcessedAmountLayout | TextAmountLayout;

interface AmountColumnProps {
  readonly task: TaskSnapshot;
  readonly tick: number;
  readonly layout: AmountLayout;
}

const AmountColumn = ({ task, tick, layout }: AmountColumnProps) => {
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

  if (layout.kind === "processed") {
    return (
      <Box flexDirection="row">
        <ProcessedCountColumn task={task} width={layout.processedWidth} />
        <AmountSeparatorColumn task={task} tick={tick} />
        <TotalCountColumn task={task} width={layout.totalWidth} />
      </Box>
    );
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

interface AmountMetrics {
  readonly hasDeterminate: boolean;
  readonly hasDetailed: boolean;
  readonly totalDigits: number;
  readonly simpleTextWidth: number;
}

const computeAmountMetrics = (rows: ReadonlyArray<TaskRowModel>, tick: number): AmountMetrics => {
  let hasDeterminate = false;
  let hasDetailed = false;
  let totalDigits = 0;
  let simpleTextWidth = 0;

  for (const row of rows) {
    const { task } = row;
    if (isDeterminate(task)) {
      hasDeterminate = true;
      totalDigits = Math.max(totalDigits, textWidth(`${task.units.total}`));
      if (task.countDisplay === "detailed") {
        hasDetailed = true;
      }
      continue;
    }

    simpleTextWidth = Math.max(simpleTextWidth, textWidth(formatAmount(task, tick)));
  }

  return {
    hasDeterminate,
    hasDetailed,
    totalDigits: Math.max(1, totalDigits),
    simpleTextWidth,
  };
};

const detailedAmountLayout = (metrics: AmountMetrics): AmountLayout => ({
  kind: "detailed",
  succeededWidth: metrics.hasDetailed ? metrics.totalDigits : 0,
  failedWidth: metrics.hasDetailed ? metrics.totalDigits : 0,
  processedWidth: metrics.totalDigits,
  totalWidth: metrics.totalDigits,
});

const processedAmountLayout = (metrics: AmountMetrics): AmountLayout => ({
  kind: "processed",
  processedWidth: metrics.totalDigits,
  totalWidth: metrics.totalDigits,
});

const detailedAmountWidth = (metrics: AmountMetrics): number =>
  metrics.totalDigits +
  1 +
  metrics.totalDigits +
  (metrics.hasDetailed ? metrics.totalDigits + 1 + metrics.totalDigits + 1 : 0);

const processedAmountWidth = (metrics: AmountMetrics): number =>
  metrics.totalDigits + 1 + metrics.totalDigits;

export const createAmountColumnSpec = (
  context: ColumnPlanningContext<TaskRowModel>,
): ColumnSpec<TaskRowModel> | undefined => {
  const metrics = computeAmountMetrics(context.rows, context.tick);
  if (!metrics.hasDeterminate && metrics.simpleTextWidth <= 0) {
    return undefined;
  }

  const detailedLayout = detailedAmountLayout(metrics);
  const processedLayout = processedAmountLayout(metrics);
  const detailedWidth = detailedAmountWidth(metrics);
  const processedWidth = processedAmountWidth(metrics);

  const variants =
    metrics.hasDeterminate && metrics.hasDetailed
      ? [
          {
            id: "detailed",
            minWidth: detailedWidth,
            idealWidth: detailedWidth,
            renderCell: (row: TaskRowModel) => (
              <AmountColumn task={row.task} tick={context.tick} layout={detailedLayout} />
            ),
          },
          {
            id: "processed",
            minWidth: processedWidth,
            idealWidth: processedWidth,
            renderCell: (row: TaskRowModel) => (
              <AmountColumn task={row.task} tick={context.tick} layout={processedLayout} />
            ),
          },
        ]
      : metrics.hasDeterminate
        ? [
            {
              id: "processed",
              minWidth: processedWidth,
              idealWidth: processedWidth,
              renderCell: (row: TaskRowModel) => (
                <AmountColumn task={row.task} tick={context.tick} layout={processedLayout} />
              ),
            },
          ]
        : [
            {
              id: "text",
              minWidth: 0,
              idealWidth: metrics.simpleTextWidth,
              renderCell: (row: TaskRowModel) => (
                <AmountColumn task={row.task} tick={context.tick} layout={{ kind: "text" }} />
              ),
            },
          ];

  return {
    id: "amount",
    grow: 0,
    canHide: true,
    variants,
  };
};
