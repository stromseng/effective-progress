import { Text } from "ink";
import type { TaskSnapshot } from "../../types";
import { formatEta } from "../format";
import { isDeterminate } from "./determinate";
import { createColumnDefinition, type Column, type RenderFrameContextValue } from "./node";
import { createStickyColumn } from "./sticky-width";
import { textWidth } from "./text-width";

const primaryUnit = (duration: string): string => duration.split(" ")[0] ?? duration;
export const ETA_STICKY_KEY = Symbol("eta");

const etaDurationText = (task: TaskSnapshot, now: number): string | undefined => {
  if (task.status !== "running" || !isDeterminate(task)) {
    return undefined;
  }

  const eta = formatEta(task, now);
  return eta.length > 0 ? eta : "--";
};

const renderEtaText = (task: TaskSnapshot, now: number, width: number): string => {
  const duration = etaDurationText(task, now);
  if (duration === undefined) {
    return "";
  }

  const prefixed = `ETA: ${duration}`;
  if (width >= textWidth(prefixed)) {
    return prefixed;
  }
  if (width >= textWidth(duration)) {
    return duration;
  }
  return primaryUnit(duration);
};

const RESERVED_ETA_WIDTH_UP_TO_ONE_HOUR = Array.from("ETA: 59m 59s").length;

const computeEtaMetrics = (frame: RenderFrameContextValue) => {
  let hasEta = false;
  let prefixedWidth = 0;
  let durationWidth = 0;
  let primaryUnitWidth = 0;

  for (const taskId of frame.taskIds) {
    const duration = etaDurationText(frame.getTask(taskId), frame.now);
    if (duration === undefined) {
      continue;
    }

    hasEta = true;
    const prefixed = `ETA: ${duration}`;
    prefixedWidth = Math.max(prefixedWidth, textWidth(prefixed));
    durationWidth = Math.max(durationWidth, textWidth(duration));
    primaryUnitWidth = Math.max(primaryUnitWidth, textWidth(primaryUnit(duration)));
  }

  return {
    hasEta,
    prefixedWidth,
    durationWidth: Math.max(2, durationWidth),
    primaryUnitWidth: Math.max(2, primaryUnitWidth),
  };
};

export const EtaColumn = (frame: RenderFrameContextValue): Column | undefined => {
  const metrics = computeEtaMetrics(frame);
  if (!metrics.hasEta) {
    return undefined;
  }

  return createStickyColumn({
    frame,
    stickyKey: ETA_STICKY_KEY,
    measure: {
      min: metrics.primaryUnitWidth,
      preferred: Math.max(metrics.prefixedWidth, RESERVED_ETA_WIDTH_UP_TO_ONE_HOUR),
      max: Math.max(metrics.prefixedWidth, RESERVED_ETA_WIDTH_UP_TO_ONE_HOUR),
    },
    render: (taskId, width) => (
      <Text wrap="truncate-end" color="gray">
        {renderEtaText(frame.getTask(taskId), frame.now, width)}
      </Text>
    ),
  });
};

export const EtaRootColumn = createColumnDefinition({ _tag: "eta" } as const, (frame) =>
  EtaColumn(frame),
);
