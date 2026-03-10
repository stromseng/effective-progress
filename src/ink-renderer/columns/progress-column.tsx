import { Box, Text, type DOMElement } from "ink";
import { useMemo, useRef, type ReactNode } from "react";
import type { TaskSnapshot } from "../../types";
import { useBoxMetrics } from "../hooks/use-box-metrics";
import { useStickyWidth } from "../hooks/use-sticky-width";
import { useRenderFrame } from "../render-frame-context";
import { isDeterminate } from "../shared/determinate";
import { formatAmount } from "../shared/format";
import { DEFAULT_BAR_WIDTH, percentText } from "../shared/progress";
import { textWidth } from "../shared/text-width";

const MIN_PROGRESS_WIDTH = 4;
const PROGRESS_PERCENT_THRESHOLD = 10;

export type ProgressPolicyMode = "full" | "percent";

const processedAmountText = (task: TaskSnapshot): string => formatAmount(task, 0);

export const preferredPercentWidth = (
  rows: ReturnType<typeof useRenderFrame>["rows"],
): number =>
  rows.reduce((max, row) => Math.max(max, textWidth(percentText(row.task))), MIN_PROGRESS_WIDTH);

const progressAmountMetrics = (rows: ReturnType<typeof useRenderFrame>["rows"]) => {
  let countDigits = 1;
  let totalWidth = 1;
  let hasDetailed = false;

  for (const row of rows) {
    countDigits = Math.max(
      countDigits,
      textWidth(`${row.task.units.succeeded}`),
      textWidth(`${row.task.units.failed}`),
      textWidth(`${row.task.units.processed}`),
    );

    totalWidth = Math.max(
      totalWidth,
      textWidth(row.task.units.total === undefined ? "?" : `${row.task.units.total}`),
    );

    hasDetailed ||= row.task.units.total !== undefined && row.task.countDisplay === "detailed";
  }

  const processedWidth = countDigits + 1 + totalWidth;
  const detailedWidth = hasDetailed
    ? countDigits + 1 + countDigits + 1 + processedWidth
    : processedWidth;

  return {
    hasDetailed,
    countDigits,
    totalWidth,
    processedWidth,
    detailedWidth,
    preferredWidth: hasDetailed ? detailedWidth : processedWidth,
    minWidth: processedWidth,
  };
};

export const preferredProgressWidth = (
  rows: ReturnType<typeof useRenderFrame>["rows"],
  _tick: number,
): number => {
  const amountWidth = progressAmountMetrics(rows).preferredWidth;
  const hasDeterminate = rows.some((row) => isDeterminate(row.task));

  if (!hasDeterminate) {
    return Math.max(MIN_PROGRESS_WIDTH, amountWidth);
  }

  return Math.max(MIN_PROGRESS_WIDTH, DEFAULT_BAR_WIDTH + 1 + amountWidth);
};

export const progressMinimumWidth = (
  rows: ReturnType<typeof useRenderFrame>["rows"],
): number => {
  let hasDeterminateRows = false;
  let processedDigits = 1;
  let totalDigits = 1;
  let simpleTextWidth = 0;

  for (const row of rows) {
    hasDeterminateRows ||= isDeterminate(row.task);
    simpleTextWidth = Math.max(simpleTextWidth, textWidth(formatAmount(row.task, 0)));
    processedDigits = Math.max(processedDigits, textWidth(`${row.task.units.processed}`));
    if (row.task.units.total !== undefined) {
      totalDigits = Math.max(totalDigits, textWidth(`${row.task.units.total}`));
    }
  }

  if (!hasDeterminateRows) {
    return Math.max(MIN_PROGRESS_WIDTH, simpleTextWidth);
  }

  return Math.max(MIN_PROGRESS_WIDTH, 4 + 1 + processedDigits + 1 + totalDigits);
};

const renderBar = (task: TaskSnapshot, width: number): ReactNode => {
  if (!isDeterminate(task)) {
    return <Text>{` `.repeat(Math.max(0, width))}</Text>;
  }

  const total = task.units.total;
  const displayTotal = Math.max(total, task.units.succeeded + task.units.failed);
  const succeededEnd =
    displayTotal === 0 ? width : Math.round((task.units.succeeded / displayTotal) * width);
  const failedEnd =
    displayTotal === 0
      ? width
      : Math.round(((task.units.succeeded + task.units.failed) / displayTotal) * width);
  const succeededLength = Math.max(0, Math.min(width, succeededEnd));
  const failedLength = Math.max(0, Math.min(width, failedEnd) - succeededLength);
  const remainingLength = Math.max(0, width - succeededLength - failedLength);

  return (
    <Text wrap="truncate-end">
      <Text color="green">{"━".repeat(succeededLength)}</Text>
      <Text color="red">{"━".repeat(failedLength)}</Text>
      <Text color="gray">{"─".repeat(remainingLength)}</Text>
    </Text>
  );
};

type ProgressVariant = "bar" | "amount" | "percent";

const resolveProgressVariant = (
  width: number,
  hasMeasured: boolean,
  rows: ReturnType<typeof useRenderFrame>["rows"],
  mode: ProgressPolicyMode,
): ProgressVariant => {
  if (!rows.some((row) => isDeterminate(row.task))) {
    return "amount";
  }

  if (mode === "percent") {
    return "percent";
  }

  if (!hasMeasured) {
    return "bar";
  }

  return width < PROGRESS_PERCENT_THRESHOLD ? "percent" : "bar";
};

const renderProgressAmount = (
  task: TaskSnapshot,
  width: number,
  metrics: ReturnType<typeof progressAmountMetrics>,
  tick: number,
): ReactNode => {
  const processed = `${task.units.processed}`.padStart(metrics.countDigits, " ");
  const total = `${task.units.total ?? "?"}`.padEnd(metrics.totalWidth, " ");

  if (metrics.hasDetailed && width >= metrics.detailedWidth) {
    const showDetailedCounts = task.units.total !== undefined && task.countDisplay === "detailed";
    return (
      <Box flexDirection="row" width={width}>
        <Text color="green">
          {showDetailedCounts
            ? `${task.units.succeeded}`.padStart(metrics.countDigits, " ")
            : " ".repeat(metrics.countDigits)}
        </Text>
        <Text>{` `}</Text>
        <Text color="red">
          {showDetailedCounts
            ? `${task.units.failed}`.padStart(metrics.countDigits, " ")
            : " ".repeat(metrics.countDigits)}
        </Text>
        <Text>{` `}</Text>
        <Text>{processed}</Text>
        <Text>/</Text>
        <Text>{total}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="row" width={width}>
      <Text>{processed}</Text>
      <Text>/</Text>
      <Text>{total}</Text>
    </Box>
  );
};

const renderProgressCell = (
  task: TaskSnapshot,
  tick: number,
  width: number,
  variant: ProgressVariant,
  amountMetrics: ReturnType<typeof progressAmountMetrics>,
): ReactNode => {
  if (variant === "percent") {
    return <Text wrap="truncate-end">{percentText(task)}</Text>;
  }

  if (variant === "amount") {
    return renderProgressAmount(task, width, amountMetrics, tick);
  }

  const combinedMin = 4 + 1 + amountMetrics.minWidth;
  if (width < combinedMin || width < PROGRESS_PERCENT_THRESHOLD) {
    return <Text wrap="truncate-end">{percentText(task)}</Text>;
  }

  const available = Math.max(0, width - 1);
  const amountWidth = Math.min(
    amountMetrics.preferredWidth,
    Math.max(amountMetrics.minWidth, available - 4),
  );
  const barWidth = Math.max(4, Math.min(DEFAULT_BAR_WIDTH, available - amountWidth));

  return (
    <Box flexDirection="row" width={width}>
      <Box width={barWidth}>{renderBar(task, barWidth)}</Box>
      <Box marginRight={1} />
      <Box width={amountWidth}>{renderProgressAmount(task, amountWidth, amountMetrics, tick)}</Box>
    </Box>
  );
};

export const ProgressColumn = ({
  mode,
  assignedWidth,
  marginRight = 0,
}: {
  readonly mode: ProgressPolicyMode;
  readonly assignedWidth?: number;
  readonly marginRight?: number;
}) => {
  const frame = useRenderFrame();
  const ref = useRef<DOMElement>(null);
  const metrics = useBoxMetrics(ref);
  const preferredWidth = useMemo(
    () => preferredProgressWidth(frame.rows, frame.tick),
    [frame.rows, frame.tick],
  );
  const percentWidth = useMemo(() => preferredPercentWidth(frame.rows), [frame.rows]);
  const amountMetrics = useMemo(() => progressAmountMetrics(frame.rows), [frame.rows]);
  const stickyWidth = useStickyWidth(preferredWidth);
  const baseWidth = assignedWidth ?? stickyWidth;
  const effectiveWidth = Math.max(
    mode === "percent" ? percentWidth : MIN_PROGRESS_WIDTH,
    baseWidth,
  );
  const width = Math.max(MIN_PROGRESS_WIDTH, metrics.width || effectiveWidth);
  const variant = resolveProgressVariant(
    width,
    metrics.hasMeasured || assignedWidth !== undefined,
    frame.rows,
    mode,
  );

  return (
    <Box
      ref={ref}
      flexDirection="column"
      flexGrow={0}
      flexShrink={1}
      flexBasis={effectiveWidth}
      width={effectiveWidth}
      minWidth={MIN_PROGRESS_WIDTH}
      marginRight={marginRight}
    >
      {frame.rows.map((row) => (
        <Box key={row.task.id as number} height={1}>
          {renderProgressCell(row.task, frame.tick, width, variant, amountMetrics)}
        </Box>
      ))}
    </Box>
  );
};
