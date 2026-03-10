import { Box, Text } from "ink";
import { formatElapsed } from "../format";
import { createColumnDefinition, type Column, type RenderFrameContextValue } from "./node";
import { createStickyColumn } from "./sticky-width";
import { textWidth } from "./text-width";

const MIN_ELAPSED_WIDTH = Array.from("10s").length;
export const ELAPSED_STICKY_KEY = Symbol("elapsed");

const maxElapsedWidth = (frame: RenderFrameContextValue): number =>
  frame.taskIds.reduce(
    (max, taskId) => Math.max(max, textWidth(formatElapsed(frame.getTask(taskId), frame.now))),
    MIN_ELAPSED_WIDTH,
  );

export const ElapsedColumn = (frame: RenderFrameContextValue): Column => {
  const elapsedContentWidth = maxElapsedWidth(frame);
  return createStickyColumn({
    frame,
    stickyKey: ELAPSED_STICKY_KEY,
    measure: {
      min: MIN_ELAPSED_WIDTH,
      preferred: elapsedContentWidth,
      max: elapsedContentWidth,
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
  });
};

export const ElapsedRootColumn = createColumnDefinition({ _tag: "elapsed" } as const, (frame) =>
  ElapsedColumn(frame),
);
