import { Box, Text, type DOMElement } from "ink";
import { useMemo, useRef } from "react";
import { useBoxMetrics } from "../hooks/use-box-metrics";
import { useStickyWidth } from "../hooks/use-sticky-width";
import { useRenderFrame } from "../render-frame-context";
import { formatElapsed, preferredElapsedWidth } from "./shared";

export const ElapsedColumn = ({
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
    () => preferredElapsedWidth(frame.rows, frame.now),
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
        const elapsed = formatElapsed(row.task, frame.now);
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
