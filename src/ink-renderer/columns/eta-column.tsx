import { Box, Text, type DOMElement } from "ink";
import { useMemo, useRef } from "react";
import type { TaskSnapshot } from "../../types";
import { useBoxMetrics } from "../hooks/use-box-metrics";
import { useNow } from "../now-context";
import { useStickyWidth } from "../hooks/use-sticky-width";
import { useRenderFrame } from "../render-frame-context";
import { formatEta } from "../shared/format";
import { textWidth } from "../shared/text-width";
import type { ColumnMeasure } from "./layout-policy";

const RESERVED_ETA_WIDTH_UP_TO_ONE_HOUR = Array.from("ETA: 59m 59s").length;

const primaryUnit = (duration: string): string => duration.split(" ")[0] ?? duration;

const etaDurationText = (task: TaskSnapshot, now: number): string | undefined => {
  const eta = formatEta(task, now);
  return eta === "" ? undefined : eta;
};

export const hasEta = (rows: ReturnType<typeof useRenderFrame>["rows"], now: number): boolean =>
  rows.some((row) => etaDurationText(row.task, now) !== undefined);

export const etaColumnMeasure = (
  rows: ReturnType<typeof useRenderFrame>["rows"],
  now: number,
): ColumnMeasure => ({
  id: "eta",
  min: 0,
  preferred: preferredEtaWidth(rows, now),
});

export const preferredEtaWidth = (
  rows: ReturnType<typeof useRenderFrame>["rows"],
  now: number,
): number =>
  rows.reduce((max, row) => {
    const duration = etaDurationText(row.task, now);
    if (duration === undefined) {
      return max;
    }

    return Math.max(max, textWidth(`ETA: ${duration}`), RESERVED_ETA_WIDTH_UP_TO_ONE_HOUR);
  }, 0);

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
  const now = useNow();
  const ref = useRef<DOMElement>(null);
  const metrics = useBoxMetrics(ref);
  const preferredWidth = useMemo(() => preferredEtaWidth(frame.rows, now), [frame.rows, now]);
  const stickyWidth = useStickyWidth(preferredWidth);
  const width = assignedWidth ?? stickyWidth;

  if (width <= 0) {
    return null;
  }

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
        if (etaDurationText(row.task, now) === undefined) {
          return <Box key={row.task.id as number} height={1} />;
        }

        const rendered = renderEtaText(
          row.task,
          now,
          metrics.hasMeasured ? metrics.width || width : width,
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
