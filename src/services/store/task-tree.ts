import type { TaskId, TaskSnapshot, TaskStore } from "../../types";

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

export const removeTransientSubtree = (
  current: TaskStore,
  nextTasks: Map<TaskId, TaskSnapshot>,
  taskId: TaskId,
) => {
  const range = findSubtreeRange(current.renderOrder, taskId);
  const removedTaskIds =
    range === undefined
      ? []
      : current.renderOrder.slice(range.start, range.end).map((row) => row.id);
  for (const removedTaskId of removedTaskIds) {
    nextTasks.delete(removedTaskId);
  }

  const nextColumns = new Map(current.columns);
  for (const removedTaskId of removedTaskIds) {
    nextColumns.delete(removedTaskId);
  }

  return {
    renderOrder:
      range === undefined
        ? current.renderOrder
        : current.renderOrder.toSpliced(range.start, range.end - range.start),
    columns: nextColumns,
  };
};
