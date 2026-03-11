import { Text } from "ink";
import type { TaskSnapshot } from "../../types";
import { useSpinnerTick } from "../../ink-renderer/spinner-context";
import { getSpinnerIndicator, getTaskIndicator } from "../../ink-renderer/shared/format";

export const TaskIndicatorGlyph = ({ task }: { readonly task: TaskSnapshot }) => {
  const tick = useSpinnerTick();
  const indicator =
    task.status === "running" ? getSpinnerIndicator(tick) : getTaskIndicator(task, tick);

  return <Text color={indicator.color}>{indicator.symbol}</Text>;
};
