import { Text } from "ink";
import type { TaskId } from "../../../types";
import type { Column, RenderFrameContextValue, WidthMeasure } from "../node";
import { isDeterminate } from "../determinate";
import { DEFAULT_BAR_WIDTH, blank } from "./shared";

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

const segmentLengths = (width: number, total: number, succeeded: number, failed: number) => {
  if (total === 0) {
    return { succeeded: width, failed: 0, remaining: 0 };
  }

  const displayTotal = Math.max(total, succeeded + failed);
  const succeededEnd = Math.round((succeeded / displayTotal) * width);
  const failedEnd = Math.round(((succeeded + failed) / displayTotal) * width);

  const succeededLength = Math.max(0, Math.min(width, succeededEnd));
  const failedLength = Math.max(0, Math.min(width, failedEnd) - succeededLength);
  const remainingLength = Math.max(0, width - succeededLength - failedLength);

  return {
    succeeded: succeededLength,
    failed: failedLength,
    remaining: remainingLength,
  };
};

export interface BarColumnConfig {
  readonly key: string;
  readonly fullWidth?: boolean;
  readonly stickyWidth?: boolean;
}

export const BarColumn = (
  frame: RenderFrameContextValue,
  config: BarColumnConfig,
): Column => {
  const baseMeasure: WidthMeasure = {
    min: 4,
    preferred: DEFAULT_BAR_WIDTH,
    max: config.fullWidth ? undefined : DEFAULT_BAR_WIDTH,
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
      if (!isDeterminate(task)) {
        return <Text>{blank(width)}</Text>;
      }

      const lengths = segmentLengths(
        Math.max(1, Math.floor(width)),
        task.units.total,
        task.units.succeeded,
        task.units.failed,
      );

      return (
        <Text wrap="truncate-end">
          <Text color="green">{"━".repeat(lengths.succeeded)}</Text>
          <Text color="red">{"━".repeat(lengths.failed)}</Text>
          <Text color="gray">{"─".repeat(lengths.remaining)}</Text>
        </Text>
      );
    },
  };
};
