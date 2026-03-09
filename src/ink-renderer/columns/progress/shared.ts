import type { TaskSnapshot } from "../../../types";
import { formatAmount } from "../../format";
import type { RenderFrameContextValue } from "../node";
import { isDeterminate } from "../determinate";
import { textWidth } from "../text-width";

export const DEFAULT_BAR_WIDTH = 30;
export const PERCENT_FALLBACK_WIDTH = 10;

export const padLeft = (value: string, width: number): string =>
  value.padStart(Math.max(0, width), " ");

export const padRight = (value: string, width: number): string =>
  value.padEnd(Math.max(0, width), " ");

export const blank = (width: number): string => " ".repeat(Math.max(0, width));

export const shouldShowCountAmount = (task: TaskSnapshot): boolean =>
  task.units.total !== undefined || task.units.processed > 0;

export const shouldShowDetailedCounts = (task: TaskSnapshot): boolean =>
  shouldShowCountAmount(task) && task.countDisplay === "detailed";

export const computeProgressMetrics = (frame: RenderFrameContextValue) => {
  let hasStructuredCounts = false;
  let hasDetailed = false;
  let hasDeterminate = false;
  let countDigits = 0;
  let totalWidth = 0;
  let simpleTextWidth = 0;

  for (const taskId of frame.taskIds) {
    const task = frame.getTask(taskId);
    hasDeterminate ||= isDeterminate(task);

    if (shouldShowCountAmount(task)) {
      hasStructuredCounts = true;
      countDigits = Math.max(
        countDigits,
        textWidth(`${task.units.succeeded}`),
        textWidth(`${task.units.failed}`),
        textWidth(`${task.units.processed}`),
      );
      totalWidth = Math.max(
        totalWidth,
        textWidth(isDeterminate(task) ? `${task.units.total}` : "?"),
      );
      if (task.countDisplay === "detailed") {
        hasDetailed = true;
      }
      continue;
    }

    simpleTextWidth = Math.max(simpleTextWidth, textWidth(formatAmount(task, frame.tick)));
  }

  return {
    hasStructuredCounts,
    hasDetailed,
    hasDeterminate,
    countDigits: Math.max(1, countDigits),
    totalWidth: Math.max(1, totalWidth),
    simpleTextWidth,
  };
};

export const processedAmountWidth = (metrics: ReturnType<typeof computeProgressMetrics>): number =>
  metrics.countDigits + 1 + metrics.totalWidth;

export const detailedAmountWidth = (metrics: ReturnType<typeof computeProgressMetrics>): number =>
  metrics.countDigits +
  1 +
  metrics.totalWidth +
  (metrics.hasDetailed ? metrics.countDigits + 1 + metrics.countDigits + 1 : 0);

export const percentText = (task: TaskSnapshot): string => {
  if (!isDeterminate(task)) {
    return formatAmount(task, 0);
  }
  if (task.units.total === 0) {
    return "100%";
  }

  const displayTotal = Math.max(task.units.total, task.units.processed);
  const percent = Math.max(
    0,
    Math.min(100, Math.round((task.units.processed / displayTotal) * 100)),
  );
  return `${percent}%`;
};
