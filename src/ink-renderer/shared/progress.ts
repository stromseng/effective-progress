import type { TaskSnapshot } from "../../types";
import { formatAmount } from "./format";
import { isDeterminate } from "./determinate";

export const DEFAULT_BAR_WIDTH = 30;

export const percentText = (task: TaskSnapshot): string => {
  if (!isDeterminate(task)) {
    return formatAmount(task, 0);
  }
  if (task.units.total === 0) {
    return "100%";
  }

  const displayTotal = Math.max(task.units.total, task.units.processed);
  const percent = Math.max(
    0,
    Math.min(100, Math.round((task.units.processed / displayTotal) * 100)),
  );
  return `${percent}%`;
};
