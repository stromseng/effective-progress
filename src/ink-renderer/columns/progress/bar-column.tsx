import { Text } from "ink";
import type { TaskId } from "../../../types";
import type { Column, RenderFrameContextValue, WidthMeasure } from "../node";
import { isDeterminate } from "../determinate";
import { createStickyColumn, type StickyWidthKey } from "../sticky-width";
import { DEFAULT_BAR_WIDTH, blank } from "./shared";

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
  readonly key: StickyWidthKey;
  readonly fullWidth?: boolean;
  readonly stickyWidth?: boolean;
}

export const BarColumn = (frame: RenderFrameContextValue, config: BarColumnConfig): Column => {
  const baseMeasure: WidthMeasure = {
    min: 4,
    preferred: DEFAULT_BAR_WIDTH,
    max: config.fullWidth ? undefined : DEFAULT_BAR_WIDTH,
  };
  return createStickyColumn({
    frame,
    measure: baseMeasure,
    stickyKey: config.stickyWidth === true ? config.key : undefined,
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
  });
};
