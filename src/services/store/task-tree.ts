import type { TaskId } from "../../task-model";
import type { TaskStore } from "./types";

export const findInsertionIndex = (
  renderOrder: ReadonlyArray<TaskStore["renderOrder"][number]>,
  parentId: TaskId | null,
) => {
  if (parentId === null) {
    return { index: renderOrder.length, depth: 0 };
  }

  const parentIdx = renderOrder.findIndex((row) => row.id === parentId);
  if (parentIdx === -1) {
    return { index: renderOrder.length, depth: 0 };
  }

  const parentDepth = renderOrder[parentIdx]!.depth;
  let i = parentIdx + 1;
  while (i < renderOrder.length && renderOrder[i]!.depth > parentDepth) {
    i++;
  }

  return { index: i, depth: parentDepth + 1 };
};

/** Finds the half-open range containing a task and all of its descendants. */
const findSubtreeRange = (renderOrder: TaskStore["renderOrder"], taskId: TaskId) => {
  const start = renderOrder.findIndex((row) => row.id === taskId);
  if (start === -1) {
    return undefined;
  }

  const taskDepth = renderOrder[start]!.depth;
  let end = start + 1;
  while (end < renderOrder.length && renderOrder[end]!.depth > taskDepth) {
    end++;
  }

  return { start, end };
};

/** Removes a task subtree from every state collection without mutating the current snapshot. */
export const removeTransientSubtree = (current: TaskStore, taskId: TaskId): TaskStore => {
  const range = findSubtreeRange(current.renderOrder, taskId);
  if (range === undefined) {
    return current;
  }

  const tasks = new Map(current.tasks);
  const columns = new Map(current.columns);
  for (const row of current.renderOrder.slice(range.start, range.end)) {
    tasks.delete(row.id);
    columns.delete(row.id);
  }

  return {
    tasks,
    renderOrder: current.renderOrder.toSpliced(range.start, range.end - range.start),
    columns,
  };
};
