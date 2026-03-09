import { Text } from "ink";
import type { TaskId } from "../../../types";
import { getDeterminateProcessedColor } from "../../format";
import type { Column, RenderFrameContextValue } from "../node";
import { isDeterminate } from "../determinate";
import { percentText } from "./shared";

export const PercentColumn = (frame: RenderFrameContextValue): Column => ({
  measure: {
    min: 4,
    preferred: 4,
    max: 4,
  },
  render: (taskId: TaskId, _width: number) => {
    const task = frame.getTask(taskId);
    const determinateColor = isDeterminate(task) ? getDeterminateProcessedColor(task) : undefined;
    const color =
      determinateColor === "green" || determinateColor === "yellow" || determinateColor === "red"
        ? determinateColor
        : undefined;

    return (
      <Text wrap="truncate-end" color={color}>
        {percentText(task)}
      </Text>
    );
  },
});
