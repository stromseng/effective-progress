import { Box, Text, type DOMElement } from "ink";
import { useMemo, useRef } from "react";
import type { TaskSnapshot } from "../../types";
import { useBoxMetrics } from "../hooks/use-box-metrics";
import { useStickyWidth } from "../hooks/use-sticky-width";
import { useRenderFrame } from "../render-frame-context";
import { etaDurationText, preferredEtaWidth, primaryUnit, textWidth } from "./shared";

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

export const EtaColumn = ({
  assignedWidth,
  marginRight = 0,
}: {
  readonly assignedWidth?: number;
  readonly marginRight?: number;
}) => {
  const frame = useRenderFrame();
  const ref = useRef<DOMElement>(null);
  const metrics = useBoxMetrics(ref);
  const preferredWidth = useMemo(
    () => preferredEtaWidth(frame.rows, frame.now),
    [frame.now, frame.rows],
  );
  const stickyWidth = useStickyWidth(preferredWidth);
  const width = assignedWidth ?? stickyWidth;

  return (
    <Box
      ref={ref}
      flexDirection="column"
      flexShrink={0}
      width={width}
      flexBasis={width}
      marginRight={marginRight}
    >
      {frame.rows.map((row) => {
        if (etaDurationText(row.task, frame.now) === undefined) {
          return <Box key={row.task.id as number} height={1} />;
        }

        const rendered = renderEtaText(
          row.task,
          frame.now,
          metrics.hasMeasured ? (metrics.width || width) : width,
        );

        return (
          <Box key={row.task.id as number} height={1}>
            <Text color="gray" wrap="truncate-end">
              {rendered}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
};
