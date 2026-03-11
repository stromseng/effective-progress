import { Box, Text, type DOMElement } from "ink";
import { useMemo, useRef } from "react";
import { useBoxMetrics } from "../hooks/use-box-metrics";
import { useNow } from "../now-context";
import { useStickyWidth } from "../hooks/use-sticky-width";
import { useRenderFrame } from "../render-frame-context";
import { formatElapsed } from "../shared/format";
import { textWidth } from "../shared/text-width";

export const MIN_ELAPSED_WIDTH = 3;

export const preferredElapsedWidth = (
  rows: ReturnType<typeof useRenderFrame>["rows"],
  now: number,
): number =>
  rows.reduce(
    (max, row) => Math.max(max, textWidth(formatElapsed(row.task, now))),
    MIN_ELAPSED_WIDTH,
  );

export const ElapsedColumn = ({
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
  const preferredWidth = useMemo(() => preferredElapsedWidth(frame.rows, now), [frame.rows, now]);
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
        const elapsed = formatElapsed(row.task, now);
        const visible = metrics.hasMeasured
          ? elapsed.slice(0, metrics.width || width || elapsed.length)
          : elapsed;

        return (
          <Box key={row.task.id as number} height={1} justifyContent="flex-end">
            <Text color="gray">{visible}</Text>
          </Box>
        );
      })}
    </Box>
  );
};
