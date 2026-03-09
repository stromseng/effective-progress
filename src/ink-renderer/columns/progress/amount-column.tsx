import { Box, Text } from "ink";
import type { TaskId, TaskSnapshot } from "../../../types";
import { formatAmount } from "../../format";
import type { Column, RenderFrameContextValue, WidthMeasure } from "../node";
import { isDeterminate } from "../determinate";
import {
  blank,
  computeProgressMetrics,
  detailedAmountWidth,
  padLeft,
  padRight,
  processedAmountWidth,
  shouldShowCountAmount,
  shouldShowDetailedCounts,
} from "./shared";

const stickyPreferred = (
  key: string,
  measure: WidthMeasure,
  stickyWidths: ReadonlyMap<string, number>,
): WidthMeasure => {
  const remembered = stickyWidths.get(key);
  if (remembered === undefined) {
    return measure;
  }

  const preferred = Math.max(measure.preferred, remembered);
  const max = measure.max === undefined ? undefined : Math.max(measure.max, preferred);
  return { ...measure, preferred, max };
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

type StructuredAmountLayout = DetailedAmountLayout | ProcessedAmountLayout;

export interface AmountColumnConfig {
  readonly key: string;
  readonly stickyWidth?: boolean;
}

const succeededCount = (task: TaskSnapshot, width: number) => {
  if (width <= 0 || !shouldShowCountAmount(task) || !shouldShowDetailedCounts(task)) {
    return <Text>{blank(width)}</Text>;
  }
  return <Text color="green">{padLeft(`${task.units.succeeded}`, width)}</Text>;
};

const failedCount = (task: TaskSnapshot, width: number) => {
  if (width <= 0 || !shouldShowCountAmount(task) || !shouldShowDetailedCounts(task)) {
    return <Text>{blank(width)}</Text>;
  }
  return <Text color="red">{padLeft(`${task.units.failed}`, width)}</Text>;
};

const processedCount = (task: TaskSnapshot, width: number) => {
  if (width <= 0 || !shouldShowCountAmount(task)) {
    return <Text>{blank(width)}</Text>;
  }
  return <Text>{padLeft(`${task.units.processed}`, width)}</Text>;
};

const totalCount = (task: TaskSnapshot, width: number) => {
  if (width <= 0 || !shouldShowCountAmount(task)) {
    return <Text>{blank(width)}</Text>;
  }
  const totalText = isDeterminate(task) ? `${task.units.total}` : "?";
  return <Text>{padRight(totalText, width)}</Text>;
};

const structuredAmount = (
  task: TaskSnapshot,
  tick: number,
  width: number,
  layout: StructuredAmountLayout,
) => {
  if (!shouldShowCountAmount(task)) {
    return <Text wrap="truncate-end">{formatAmount(task, tick)}</Text>;
  }

  if (layout.kind === "processed") {
    return (
      <Box flexDirection="row" width={width}>
        {processedCount(task, layout.processedWidth)}
        <Text>/</Text>
        {totalCount(task, layout.totalWidth)}
      </Box>
    );
  }

  return (
    <Box flexDirection="row" width={width}>
      {layout.succeededWidth > 0 ? (
        <>
          {succeededCount(task, layout.succeededWidth)}
          <Text>{` `}</Text>
        </>
      ) : null}
      {layout.failedWidth > 0 ? (
        <>
          {failedCount(task, layout.failedWidth)}
          <Text>{` `}</Text>
        </>
      ) : null}
      {processedCount(task, layout.processedWidth)}
      <Text>/</Text>
      {totalCount(task, layout.totalWidth)}
    </Box>
  );
};

export const AmountColumn = (
  frame: RenderFrameContextValue,
  config: AmountColumnConfig,
): Column => {
  const metrics = computeProgressMetrics(frame);
  const detailedWidth = detailedAmountWidth(metrics);
  const processedWidth = processedAmountWidth(metrics);
  const preferredWidth = metrics.hasStructuredCounts
    ? metrics.hasDetailed
      ? detailedWidth
      : processedWidth
    : Math.max(1, metrics.simpleTextWidth);
  const minWidth = metrics.hasStructuredCounts ? processedWidth : Math.max(1, metrics.simpleTextWidth);
  const summary = {
    hasDetailed: metrics.hasDetailed,
    countDigits: metrics.countDigits,
    totalWidth: metrics.totalWidth,
    detailedWidth,
    processedWidth,
    preferredWidth,
    minWidth,
    simpleTextWidth: Math.max(1, metrics.simpleTextWidth),
  };
  const baseMeasure: WidthMeasure = {
    min: summary.minWidth,
    preferred: summary.preferredWidth,
    max: summary.preferredWidth,
  };
  const measure =
    config.stickyWidth === true
      ? stickyPreferred(config.key, baseMeasure, frame.stickyWidths)
      : baseMeasure;
  if (config.stickyWidth === true) {
    frame.stickyWidths.set(config.key, measure.preferred);
  }

  return {
    measure,
    render: (taskId: TaskId, width: number) => {
      const task = frame.getTask(taskId);

      if (!shouldShowCountAmount(task)) {
        return <Text wrap="truncate-end">{formatAmount(task, frame.tick)}</Text>;
      }

      if (summary.hasDetailed && width >= summary.detailedWidth) {
        return structuredAmount(task, frame.tick, width, {
          kind: "detailed",
          succeededWidth: summary.countDigits,
          failedWidth: summary.countDigits,
          processedWidth: summary.countDigits,
          totalWidth: summary.totalWidth,
        });
      }

      return structuredAmount(task, frame.tick, width, {
        kind: "processed",
        processedWidth: summary.countDigits,
        totalWidth: summary.totalWidth,
      });
    },
  };
};
