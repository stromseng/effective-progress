import { Box, Text } from "ink";
import { formatElapsed } from "../format";
import type { Column, RenderFrameContextValue } from "./node";
import { textWidth } from "./text-width";

const MIN_ELAPSED_WIDTH = Array.from("10s").length;

const maxElapsedWidth = (frame: RenderFrameContextValue): number =>
  frame.taskIds.reduce(
    (max, taskId) => Math.max(max, textWidth(formatElapsed(frame.getTask(taskId), frame.now))),
    MIN_ELAPSED_WIDTH,
  );

export const ElapsedColumn = (frame: RenderFrameContextValue): Column => {
  const elapsedContentWidth = maxElapsedWidth(frame);
  const stickyKey = "elapsed";
  const preferred = Math.max(elapsedContentWidth, frame.stickyWidths.get(stickyKey) ?? 0);
  frame.stickyWidths.set(stickyKey, preferred);

  return {
    measure: {
      min: MIN_ELAPSED_WIDTH,
      preferred,
      max: preferred,
    },
    render: (taskId, width) => {
      const formatted = formatElapsed(frame.getTask(taskId), frame.now);
      const visible = textWidth(formatted) <= width ? formatted : formatted.slice(0, width);

      return (
        <Box width={width} justifyContent="flex-end">
          <Text color="gray">{visible}</Text>
        </Box>
      );
    },
  };
};
