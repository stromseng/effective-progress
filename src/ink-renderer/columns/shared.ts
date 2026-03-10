import type { TaskSnapshot } from "../../types";
import { DEFAULT_BAR_WIDTH, percentText } from "./progress/shared";
import { formatAmount, formatElapsed, formatEta, getTaskIndicator } from "../format";
import { isDeterminate } from "./determinate";
import { textWidth } from "./text-width";
import type { useRenderFrame } from "../render-frame-context";

export const COLUMN_GAP = 1;
export const MIN_DESCRIPTION_WIDTH = 1;
export const MIN_PLAIN_DESCRIPTION_WIDTH = 8;
export const MIN_COMPACT_DESCRIPTION_WIDTH = 3;
export const MIN_TREE_DESCRIPTION_TEXT_WIDTH = 6;
export const MIN_ELAPSED_WIDTH = 3;
export const MIN_PROGRESS_WIDTH = 4;
export const PROGRESS_PERCENT_THRESHOLD = 10;
export const RESERVED_ETA_WIDTH_UP_TO_ONE_HOUR = Array.from("ETA: 59m 59s").length;

export type FrameRows = ReturnType<typeof useRenderFrame>["rows"];

export type DescriptionVariant = "tree" | "plain" | "compact" | "spinner";
export type DescriptionCap = "tree" | "plain" | "compact" | "spinner";
export type ProgressPolicyMode = "full" | "percent";

export interface RootLayoutPolicy {
  readonly descriptionCap: DescriptionCap;
  readonly progressMode?: ProgressPolicyMode;
  readonly showElapsed: boolean;
  readonly showEta: boolean;
}

export interface ColumnMeasure {
  readonly id: "description" | "progress" | "elapsed" | "eta";
  readonly min: number;
  readonly preferred: number;
}

export const treeAncestorPrefix = (ancestorHasNextSibling: ReadonlyArray<boolean>): string =>
  ancestorHasNextSibling
    .slice(1)
    .map((hasNext) => (hasNext ? "│  " : "   "))
    .join("");

export const renderTreePrefix = (tree: FrameRows[number]["tree"]): string => {
  if (tree.depth <= 0) {
    return "";
  }

  const ancestor = treeAncestorPrefix(tree.ancestorHasNextSibling);
  return `${ancestor}${tree.hasNextSibling ? "├─ " : "└─ "}`;
};

export const hasRenderableProgress = (rows: FrameRows): boolean =>
  rows.some((row) => row.task.units.total !== undefined || row.task.units.processed > 0);

export const hasEta = (rows: FrameRows, now: number): boolean =>
  rows.some((row) => formatEta(row.task, now).length > 0);

export const maxDescriptionWidth = (rows: FrameRows, showTree: boolean): number =>
  rows.reduce((max, row) => {
    const treePrefix = showTree ? renderTreePrefix(row.tree) : "";
    return Math.max(max, textWidth(`${treePrefix}${row.task.description}`) + 2);
  }, MIN_PLAIN_DESCRIPTION_WIDTH);

export const minTreeDescriptionWidth = (rows: FrameRows): number =>
  rows.reduce((max, row) => {
    const treePrefixWidth = textWidth(renderTreePrefix(row.tree));
    return Math.max(max, treePrefixWidth + 2 + MIN_TREE_DESCRIPTION_TEXT_WIDTH);
  }, MIN_PLAIN_DESCRIPTION_WIDTH);

export const preferredDescriptionWidth = (rows: FrameRows): number => {
  const hasNestedRows = rows.some((row) => row.tree.depth > 0);
  return hasNestedRows
    ? Math.max(maxDescriptionWidth(rows, true), minTreeDescriptionWidth(rows))
    : maxDescriptionWidth(rows, false);
};

export const preferredDescriptionWidthForCap = (rows: FrameRows, cap: DescriptionCap): number => {
  if (cap === "spinner") {
    return MIN_DESCRIPTION_WIDTH;
  }

  if (cap === "compact") {
    return maxDescriptionWidth(rows, false);
  }

  if (cap === "plain") {
    return maxDescriptionWidth(rows, false);
  }

  return preferredDescriptionWidth(rows);
};

export const preferredProgressWidth = (rows: FrameRows, tick: number): number => {
  const amountWidth = progressAmountMetrics(rows).preferredWidth;

  if (!rows.some((row) => isDeterminate(row.task))) {
    return Math.max(MIN_PROGRESS_WIDTH, amountWidth);
  }

  return Math.max(MIN_PROGRESS_WIDTH, DEFAULT_BAR_WIDTH + 1 + amountWidth);
};

export const processedAmountText = (task: TaskSnapshot, tick: number): string =>
  task.units.total !== undefined ? `${task.units.processed}/${task.units.total}` : formatAmount(task, tick);

export const preferredPercentWidth = (rows: FrameRows): number =>
  rows.reduce((max, row) => Math.max(max, textWidth(percentText(row.task))), MIN_PROGRESS_WIDTH);

export const progressMinimumWidth = (rows: FrameRows): number => {
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

export const progressAmountMetrics = (rows: FrameRows) => {
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
  const detailedWidth = hasDetailed ? countDigits + 1 + countDigits + 1 + processedWidth : processedWidth;

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

export const preferredElapsedWidth = (rows: FrameRows, now: number): number =>
  rows.reduce((max, row) => Math.max(max, textWidth(formatElapsed(row.task, now))), MIN_ELAPSED_WIDTH);

export const primaryUnit = (duration: string): string => duration.split(" ")[0] ?? duration;

export const etaDurationText = (task: TaskSnapshot, now: number): string | undefined => {
  const eta = formatEta(task, now);
  return eta.length > 0 ? eta : undefined;
};

export const etaMinimumWidth = (rows: FrameRows, now: number): number =>
  rows.reduce((max, row) => {
    const duration = etaDurationText(row.task, now);
    return duration === undefined ? max : Math.max(max, textWidth(primaryUnit(duration)));
  }, 0);

export const preferredEtaWidth = (rows: FrameRows, now: number): number =>
  rows.reduce((max, row) => {
    const duration = etaDurationText(row.task, now);
    if (duration === undefined) {
      return max;
    }

    return Math.max(max, textWidth(`ETA: ${duration}`), RESERVED_ETA_WIDTH_UP_TO_ONE_HOUR);
  }, 0);

export const minimumDescriptionWidth = (cap: DescriptionCap): number =>
  cap === "spinner"
    ? MIN_DESCRIPTION_WIDTH
    : cap === "compact"
      ? MIN_COMPACT_DESCRIPTION_WIDTH
      : MIN_PLAIN_DESCRIPTION_WIDTH;

export const visibleWidth = (widths: ReadonlyArray<number>, gap: number): number => {
  const visible = widths.filter((width) => width > 0);
  return visible.reduce((sum, width) => sum + width, 0) + Math.max(0, visible.length - 1) * gap;
};

const nextDistinctWidth = (
  entries: ReadonlyArray<{ readonly width: number }>,
  widest: number,
): number | undefined => entries.find((entry) => entry.width < widest)?.width;

export const reduceOverflowRichStyle = (
  widths: Array<number>,
  minimums: ReadonlyArray<number>,
  targetWidth: number,
): Array<number> => {
  let overflow = visibleWidth(widths, COLUMN_GAP) - targetWidth;
  while (overflow > 0) {
    const shrinkable = widths
      .map((width, index) => ({
        width,
        index,
        minimum: minimums[index] ?? width,
      }))
      .filter(({ width, minimum }) => width > minimum)
      .sort((left, right) => right.width - left.width || left.index - right.index);

    if (shrinkable.length === 0) {
      break;
    }

    const widest = shrinkable[0]!.width;
    const cohort = shrinkable.filter(({ width }) => width === widest);
    const nextWidth = nextDistinctWidth(shrinkable, widest);
    const floor = Math.max(nextWidth ?? 0, ...cohort.map(({ minimum }) => minimum));
    const maxUniformDrop = widest - floor;
    const uniformDrop = Math.min(maxUniformDrop, Math.floor(overflow / cohort.length));

    if (uniformDrop > 0) {
      for (const { index } of cohort) {
        widths[index] = widths[index]! - uniformDrop;
      }
      overflow -= uniformDrop * cohort.length;
      continue;
    }

    let changed = false;
    for (const { index, minimum } of cohort) {
      if (overflow <= 0) {
        break;
      }

      if (widths[index]! <= minimum) {
        continue;
      }

      widths[index] = widths[index]! - 1;
      overflow -= 1;
      changed = true;
    }

    if (!changed) {
      break;
    }
  }

  return widths;
};

export { DEFAULT_BAR_WIDTH, percentText } from "./progress/shared";
export { formatElapsed, getTaskIndicator } from "../format";
export { isDeterminate } from "./determinate";
export { textWidth } from "./text-width";
