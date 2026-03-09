import { Text } from "ink";
import { formatElapsed } from "../format";
import { hasDeterminateRows } from "./determinate";
import type { Column, RenderFrameContextValue } from "./node";
import { textWidth } from "./text-width";

const MIN_ELAPSED_WIDTH = 2;
const RESERVED_ELAPSED_WIDTH_UP_TO_ONE_HOUR = Array.from("59m 59s").length;

const maxElapsedWidth = (frame: RenderFrameContextValue): number =>
  frame.taskIds.reduce(
    (max, taskId) => Math.max(max, textWidth(formatElapsed(frame.getTask(taskId), frame.now))),
    MIN_ELAPSED_WIDTH,
  );

export const ElapsedColumn = (frame: RenderFrameContextValue): Column => {
  const elapsedContentWidth = maxElapsedWidth(frame);
  const rows = frame.taskIds.map((taskId) => ({
    task: frame.getTask(taskId),
    tree: frame.getTree(taskId),
  }));
  const hasDeterminate = hasDeterminateRows(rows);

  const stickyKey = "elapsed";
  const basePreferred = hasDeterminate
    ? Math.max(elapsedContentWidth, RESERVED_ELAPSED_WIDTH_UP_TO_ONE_HOUR)
    : elapsedContentWidth;
  const preferred = Math.max(basePreferred, frame.stickyWidths.get(stickyKey) ?? 0);
  frame.stickyWidths.set(stickyKey, preferred);

  return {
    measure: {
      min: MIN_ELAPSED_WIDTH,
      preferred,
      max: preferred,
    },
    render: (taskId) => (
      <Text wrap="truncate-end" color="gray">
        {formatElapsed(frame.getTask(taskId), frame.now)}
      </Text>
    ),
  };
};
